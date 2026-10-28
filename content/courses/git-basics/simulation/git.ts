/**
 * A small, deterministic Git for the version-control course: commits with
 * full snapshots, the index, branches and HEAD, three-way merges with
 * conflict markers, revert, reset, and one remote ("origin") that teammates
 * push to. Plus a tiny shell (ls, cat, echo >, rm) and an editor action.
 *
 * Nothing real is executed. The browser labs and the server-side validators
 * both replay the same action history on a fresh repository.
 */

export type Tree = Record<string, string>;

export type Commit = { id: string; parents: string[]; message: string; author: string; time: string; tree: Tree };

export type Repo = {
  commits: Record<string, Commit>;
  /** Commits this clone has seen; the remote may hold others until a fetch. */
  known: Set<string>;
  branches: Record<string, string>;
  head: { branch: string } | { detached: string };
  index: Tree;
  work: Tree;
  remote: Record<string, string>;
  tracking: Record<string, string>;
  upstream: Record<string, string>;
  merging: { kind: "merge" | "revert"; theirs: string; label: string; message: string; conflicts: string[] } | null;
  user: string;
  clock: number;
  events: string[];
};

export type Action = string | { edit: string; content: string };
export type Result = { out: string; err: string; code: number; clear?: boolean };

export const LIMITS = { history: 60, command: 200, path: 60, content: 4000, files: 40 };
export const REMOTE_URL = "https://git.library.test/library-site.git";

// ---------------------------------------------------------------------------
// Hashing and time
// ---------------------------------------------------------------------------

function fnv(text: string, seed: number): string {
  let hash = 0x811c9dc5 ^ seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function hashCommit(commit: Omit<Commit, "id">): string {
  const body = JSON.stringify([commit.parents, commit.message, commit.author, commit.time, Object.entries(commit.tree).sort()]);
  return [0, 1, 2, 3, 4].map((seed) => fnv(body, seed)).join("");
}

export const short = (id: string) => id.slice(0, 7);

/** New commits made during a lab start after every scenario commit (all before 16:00). */
const BASE_MINUTES = Date.UTC(2026, 9, 28, 16, 0) / 60_000;

export function timeAt(minutes: number): string {
  return new Date((BASE_MINUTES + minutes) * 60_000).toISOString().slice(0, 16).replace("T", " ");
}

/** Builds a commit into the store (for setting up a scenario) and returns it. */
export function makeCommit(repo: Repo, parents: string[], tree: Tree, message: string, author: string, time: string): Commit {
  const base = { parents, message, author, time, tree: { ...tree } };
  const commit = { ...base, id: hashCommit(base) };
  repo.commits[commit.id] = commit;
  return commit;
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

export function headId(repo: Repo): string | undefined {
  return "branch" in repo.head ? repo.branches[repo.head.branch] : repo.head.detached;
}

export function headTree(repo: Repo): Tree {
  const id = headId(repo);
  return id ? repo.commits[id]!.tree : {};
}

export function ancestors(repo: Repo, id: string | undefined): Set<string> {
  const seen = new Set<string>();
  const stack = id ? [id] : [];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...repo.commits[current]!.parents);
  }
  return seen;
}

export function isAncestor(repo: Repo, maybe: string, of: string): boolean {
  return ancestors(repo, of).has(maybe);
}

function mergeBase(repo: Repo, a: string, b: string): string | undefined {
  const fromA = ancestors(repo, a);
  const common = [...ancestors(repo, b)].filter((id) => fromA.has(id));
  return common.find((candidate) => !common.some((other) => other !== candidate && isAncestor(repo, candidate, other)));
}

/** Commits reachable from the given tips, newest first; a commit always comes before its parents. */
export function history(repo: Repo, tips: string[]): Commit[] {
  const seen = new Set<string>();
  for (const tip of tips) for (const id of ancestors(repo, tip)) seen.add(id);
  const pending = new Map<string, number>([...seen].map((id) => [id, 0]));
  for (const id of seen) for (const parent of repo.commits[id]!.parents) pending.set(parent, (pending.get(parent) ?? 0) + 1);
  const ready = [...seen].filter((id) => pending.get(id) === 0);
  const out: Commit[] = [];
  while (ready.length) {
    ready.sort((a, b) => (repo.commits[a]!.time < repo.commits[b]!.time ? -1 : 1));
    const commit = repo.commits[ready.pop()!]!;
    out.push(commit);
    for (const parent of commit.parents) {
      const left = pending.get(parent)! - 1;
      pending.set(parent, left);
      if (left === 0) ready.push(parent);
    }
  }
  return out;
}

/** Every ref that points at a commit, for `log` decorations and the graph view. */
export function refsAt(repo: Repo): Record<string, string[]> {
  const refs: Record<string, string[]> = {};
  const add = (id: string | undefined, name: string) => {
    if (id) (refs[id] ??= []).push(name);
  };
  if ("detached" in repo.head) add(repo.head.detached, "HEAD");
  for (const [name, id] of Object.entries(repo.branches)) add(id, "branch" in repo.head && repo.head.branch === name ? `HEAD -> ${name}` : name);
  for (const [name, id] of Object.entries(repo.tracking)) add(id, `origin/${name}`);
  for (const list of Object.values(refs)) list.sort((a, b) => (a.startsWith("HEAD") ? -1 : b.startsWith("HEAD") ? 1 : 0));
  return refs;
}

export function localTips(repo: Repo): string[] {
  return [...Object.values(repo.branches), ...Object.values(repo.tracking), ...("detached" in repo.head ? [repo.head.detached] : [])];
}

/** `main`, `HEAD~2`, `origin/main`, `a1b2c3d`… → a known commit id. */
export function resolveRev(repo: Repo, rev: string): string | undefined {
  const match = /^(.+?)((?:[~^]\d*)*)$/.exec(rev);
  if (!match) return undefined;
  const [, name, suffix] = match as unknown as [string, string, string];
  let id: string | undefined;
  if (name === "HEAD" || name === "@") id = headId(repo);
  else if (repo.branches[name]) id = repo.branches[name];
  else if (name.startsWith("origin/") && repo.tracking[name.slice(7)]) id = repo.tracking[name.slice(7)];
  else if (/^[0-9a-f]{4,40}$/.test(name)) {
    const hits = [...repo.known].filter((candidate) => candidate.startsWith(name));
    if (hits.length === 1) id = hits[0];
  }
  for (const step of suffix.match(/[~^]\d*/g) ?? []) {
    if (!id) return undefined;
    const count = step.length > 1 ? Number(step.slice(1)) : 1;
    if (step[0] === "^") id = count === 0 ? id : repo.commits[id]!.parents[count - 1];
    else for (let index = 0; index < count && id; index += 1) id = repo.commits[id]!.parents[0];
  }
  return id;
}

// ---------------------------------------------------------------------------
// Line diff and three-way merge
// ---------------------------------------------------------------------------

export function splitLines(text: string): string[] {
  if (text === "") return [];
  const rows = text.split("\n");
  if (rows[rows.length - 1] === "") rows.pop();
  return rows;
}

const joinLines = (rows: string[]) => (rows.length ? `${rows.join("\n")}\n` : "");

type Op = { kind: "same" | "del" | "add"; text: string; a: number; b: number };

/** LCS line diff: a sequence of same / del / add operations. */
export function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push({ kind: "same", text: a[i]!, a: i++, b: j++ });
    else if (j < m && (i >= n || table[i]![j + 1]! > table[i + 1]![j]!)) ops.push({ kind: "add", text: b[j]!, a: i, b: j++ });
    else ops.push({ kind: "del", text: a[i]!, a: i++, b: j });
  }
  return ops;
}

type Hunk = { start: number; end: number; lines: string[] };

/** Changed regions of `b` relative to `base`, as [start, end) ranges of base lines. */
function hunks(base: string[], b: string[]): Hunk[] {
  const out: Hunk[] = [];
  let current: Hunk | null = null;
  for (const op of diffLines(base, b)) {
    if (op.kind === "same") {
      if (current) out.push(current);
      current = null;
      continue;
    }
    current ??= { start: op.a, end: op.a, lines: [] };
    if (op.kind === "del") current.end = op.a + 1;
    else current.lines.push(op.text);
  }
  if (current) out.push(current);
  return out;
}

/** diff3-style merge. Returns merged text, or text with conflict markers. */
export function mergeText(base: string, ours: string, theirs: string, labels: [string, string]): { text: string; conflict: boolean } {
  if (ours === theirs) return { text: ours, conflict: false };
  if (base === ours) return { text: theirs, conflict: false };
  if (base === theirs) return { text: ours, conflict: false };
  const baseLines = splitLines(base);
  const oursLines = splitLines(ours);
  const theirsLines = splitLines(theirs);
  const tagged = [...hunks(baseLines, oursLines).map((hunk) => ({ ...hunk, side: "ours" as const })), ...hunks(baseLines, theirsLines).map((hunk) => ({ ...hunk, side: "theirs" as const }))].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: string[] = [];
  let cursor = 0;
  let conflict = false;
  let index = 0;
  while (index < tagged.length) {
    const group = [tagged[index]!];
    let end = tagged[index]!.end;
    index += 1;
    while (index < tagged.length && (tagged[index]!.start < end || (tagged[index]!.start === end && tagged[index]!.start === group[0]!.start))) {
      end = Math.max(end, tagged[index]!.end);
      group.push(tagged[index]!);
      index += 1;
    }
    const start = group[0]!.start;
    out.push(...baseLines.slice(cursor, start));
    const sides = new Set(group.map((hunk) => hunk.side));
    const render = (side: "ours" | "theirs") => {
      const mine = group.filter((hunk) => hunk.side === side);
      if (mine.length === 0) return baseLines.slice(start, end);
      // Re-derive this side's text for the base range [start, end).
      const rows: string[] = [];
      let at = start;
      for (const hunk of mine) {
        rows.push(...baseLines.slice(at, hunk.start), ...hunk.lines);
        at = hunk.end;
      }
      rows.push(...baseLines.slice(at, end));
      return rows;
    };
    if (sides.size === 1) out.push(...render(group[0]!.side));
    else {
      const left = render("ours");
      const right = render("theirs");
      if (left.join("\n") === right.join("\n")) out.push(...left);
      else {
        conflict = true;
        out.push(`<<<<<<< ${labels[0]}`, ...left, "=======", ...right, `>>>>>>> ${labels[1]}`);
      }
    }
    cursor = end;
  }
  out.push(...baseLines.slice(cursor));
  return { text: joinLines(out), conflict };
}

export function hasMarkers(text: string): boolean {
  return /^(<<<<<<<|=======|>>>>>>>)( |$)/m.test(text);
}

function mergeTrees(base: Tree, ours: Tree, theirs: Tree, labels: [string, string]): { tree: Tree; conflicts: string[] } {
  const tree: Tree = {};
  const conflicts: string[] = [];
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])].sort()) {
    const b = base[path];
    const o = ours[path];
    const t = theirs[path];
    if (o === t) {
      if (o !== undefined) tree[path] = o;
    } else if (b === o) {
      if (t !== undefined) tree[path] = t;
    } else if (b === t) {
      if (o !== undefined) tree[path] = o;
    } else if (o === undefined || t === undefined) {
      tree[path] = (o ?? t)!;
      conflicts.push(path);
    } else {
      const merged = mergeText(b ?? "", o, t, labels);
      tree[path] = merged.text;
      if (merged.conflict) conflicts.push(path);
    }
  }
  return { tree, conflicts };
}

// ---------------------------------------------------------------------------
// Unified diff output
// ---------------------------------------------------------------------------

export function unifiedDiff(path: string, before: string | undefined, after: string | undefined): string {
  if (before === after) return "";
  const a = splitLines(before ?? "");
  const b = splitLines(after ?? "");
  const ops = diffLines(a, b);
  const header = [`diff --git a/${path} b/${path}`];
  if (before === undefined) header.push("new file mode 100644");
  if (after === undefined) header.push("deleted file mode 100644");
  header.push(`--- ${before === undefined ? "/dev/null" : `a/${path}`}`, `+++ ${after === undefined ? "/dev/null" : `b/${path}`}`);
  const changed = ops.map((op, index) => (op.kind === "same" ? -1 : index)).filter((index) => index >= 0);
  const out: string[] = [];
  let index = 0;
  while (index < changed.length) {
    const first = changed[index]!;
    let last = first;
    while (index + 1 < changed.length && changed[index + 1]! - last <= 6) last = changed[++index]!;
    index += 1;
    const from = Math.max(0, first - 3);
    const to = Math.min(ops.length, last + 4);
    const slice = ops.slice(from, to);
    const aStart = slice.find((op) => op.kind !== "add")?.a ?? slice[0]!.a;
    const bStart = slice.find((op) => op.kind !== "del")?.b ?? slice[0]!.b;
    const aCount = slice.filter((op) => op.kind !== "add").length;
    const bCount = slice.filter((op) => op.kind !== "del").length;
    out.push(`@@ -${aCount ? aStart + 1 : aStart},${aCount} +${bCount ? bStart + 1 : bStart},${bCount} @@`);
    for (const op of slice) out.push(`${op.kind === "same" ? " " : op.kind === "del" ? "-" : "+"}${op.text}`);
  }
  return `${[...header, ...out].join("\n")}\n`;
}

function treeDiff(before: Tree, after: Tree, paths?: string[]): string {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((path) => !paths || paths.some((spec) => matchesPath(spec, path)))
    .map((path) => unifiedDiff(path, before[path], after[path]))
    .join("");
}

function stat(before: Tree, after: Tree): string {
  const rows: string[] = [];
  let plus = 0;
  let minus = 0;
  for (const path of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (before[path] === after[path]) continue;
    const ops = diffLines(splitLines(before[path] ?? ""), splitLines(after[path] ?? ""));
    const add = ops.filter((op) => op.kind === "add").length;
    const del = ops.filter((op) => op.kind === "del").length;
    plus += add;
    minus += del;
    rows.push(` ${path.padEnd(14)} | ${String(add + del).padStart(2)} ${"+".repeat(Math.min(add, 20))}${"-".repeat(Math.min(del, 20))}`);
  }
  const files = rows.length;
  rows.push(` ${files} file${files === 1 ? "" : "s"} changed${plus ? `, ${plus} insertion${plus === 1 ? "" : "s"}(+)` : ""}${minus ? `, ${minus} deletion${minus === 1 ? "" : "s"}(-)` : ""}`);
  return `${rows.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Ignore rules and status
// ---------------------------------------------------------------------------

function globToRegExp(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${body}$`);
}

export function isIgnored(repo: Repo, path: string): boolean {
  const rules = splitLines(repo.work[".gitignore"] ?? "")
    .map((row) => row.trim())
    .filter((row) => row && !row.startsWith("#"));
  return rules.some((rule) => {
    const clean = rule.replace(/^\//, "");
    if (clean.endsWith("/")) return path.startsWith(clean);
    return clean.includes("/") ? globToRegExp(clean).test(path) : path.split("/").some((part) => globToRegExp(clean).test(part));
  });
}

function matchesPath(spec: string, path: string): boolean {
  const clean = spec.replace(/^\.\//, "").replace(/\/$/, "");
  if (clean === "." || clean === "") return true;
  if (clean.includes("*")) return globToRegExp(clean).test(path);
  return path === clean || path.startsWith(`${clean}/`);
}

export type FileState = { path: string; staged?: "new file" | "modified" | "deleted"; unstaged?: "modified" | "deleted"; untracked?: boolean; conflict?: boolean };

export function fileStates(repo: Repo): FileState[] {
  const head = headTree(repo);
  const paths = [...new Set([...Object.keys(head), ...Object.keys(repo.index), ...Object.keys(repo.work)])].sort();
  const states: FileState[] = [];
  for (const path of paths) {
    const state: FileState = { path };
    if (repo.merging?.conflicts.includes(path)) state.conflict = true;
    else {
      const h = head[path];
      const i = repo.index[path];
      const w = repo.work[path];
      if (h !== i) state.staged = h === undefined ? "new file" : i === undefined ? "deleted" : "modified";
      if (i === undefined && w !== undefined) {
        if (!isIgnored(repo, path)) state.untracked = true;
      } else if (i !== w) state.unstaged = w === undefined ? "deleted" : "modified";
    }
    if (state.staged || state.unstaged || state.untracked || state.conflict) states.push(state);
  }
  return states;
}

function aheadBehind(repo: Repo, branch: string): string[] {
  const upstream = repo.upstream[branch];
  const local = repo.branches[branch];
  const remote = upstream ? repo.tracking[upstream] : undefined;
  if (!upstream || !local || !remote) return [];
  const mine = ancestors(repo, local);
  const theirs = ancestors(repo, remote);
  const ahead = [...mine].filter((id) => !theirs.has(id)).length;
  const behind = [...theirs].filter((id) => !mine.has(id)).length;
  const s = (count: number) => `${count} commit${count === 1 ? "" : "s"}`;
  if (ahead && behind) return [`Your branch and 'origin/${upstream}' have diverged,`, `and have ${ahead} and ${behind} different commits each, respectively.`, '  (use "git pull" if you want to integrate the remote branch with yours)'];
  if (ahead) return [`Your branch is ahead of 'origin/${upstream}' by ${s(ahead)}.`, '  (use "git push" to publish your local commits)'];
  if (behind) return [`Your branch is behind 'origin/${upstream}' by ${s(behind)}, and can be fast-forwarded.`, '  (use "git pull" to update your local branch)'];
  return [`Your branch is up to date with 'origin/${upstream}'.`];
}

function status(repo: Repo, shortFormat: boolean): string {
  const states = fileStates(repo);
  if (shortFormat) {
    return states
      .map((state) => {
        if (state.conflict) return `UU ${state.path}`;
        if (state.untracked) return `?? ${state.path}`;
        const x = state.staged === "new file" ? "A" : state.staged === "deleted" ? "D" : state.staged ? "M" : " ";
        const y = state.unstaged === "deleted" ? "D" : state.unstaged ? "M" : " ";
        return `${x}${y} ${state.path}`;
      })
      .map((row) => `${row}\n`)
      .join("");
  }
  const rows: string[] = ["branch" in repo.head ? `On branch ${repo.head.branch}` : `HEAD detached at ${short(repo.head.detached)}`];
  if ("branch" in repo.head) rows.push(...aheadBehind(repo, repo.head.branch));
  if (repo.merging) {
    rows.push(
      "",
      repo.merging.conflicts.length ? "You have unmerged paths." : "All conflicts fixed but you are still merging.",
      repo.merging.conflicts.length ? '  (fix conflicts and run "git commit")' : '  (use "git commit" to conclude merge)',
      '  (use "git merge --abort" to abort the merge)',
    );
  }
  const staged = states.filter((state) => state.staged);
  const conflicted = states.filter((state) => state.conflict);
  const unstaged = states.filter((state) => state.unstaged);
  const untracked = states.filter((state) => state.untracked);
  if (staged.length) rows.push("", "Changes to be committed:", '  (use "git restore --staged <file>..." to unstage)', ...staged.map((state) => `\t${`${state.staged}:`.padEnd(12)}${state.path}`));
  if (conflicted.length) rows.push("", "Unmerged paths:", '  (use "git add <file>..." to mark resolution)', ...conflicted.map((state) => `\tboth modified:   ${state.path}`));
  if (unstaged.length)
    rows.push("", "Changes not staged for commit:", '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)', ...unstaged.map((state) => `\t${`${state.unstaged}:`.padEnd(12)}${state.path}`));
  if (untracked.length) rows.push("", "Untracked files:", '  (use "git add <file>..." to include in what will be committed)', ...untracked.map((state) => `\t${state.path}`));
  if (!staged.length && !conflicted.length && !unstaged.length && !untracked.length && !repo.merging) rows.push("", "nothing to commit, working tree clean");
  else if (!staged.length && !repo.merging && (unstaged.length || untracked.length)) rows.push("", `no changes added to commit (use "git add" and/or "git commit -a")`);
  return `${rows.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

class ParseError extends Error {}

function tokenize(line: string): string[] {
  const words: string[] = [];
  let word: string | null = null;
  let index = 0;
  while (index < line.length) {
    const char = line[index]!;
    if (char === " " || char === "\t") {
      if (word !== null) words.push(word);
      word = null;
      index += 1;
    } else if (char === "'" || char === '"') {
      const close = line.indexOf(char, index + 1);
      if (close === -1) throw new ParseError(`引号没有配对：缺少结尾的 ${char}`);
      word = (word ?? "") + line.slice(index + 1, close);
      index = close + 1;
    } else if (char === ">" || char === "|" || char === ";" || char === "&") {
      if (word !== null) words.push(word);
      word = null;
      const two = line.slice(index, index + 2);
      if (two === ">>" || two === "&&" || two === "||") {
        words.push(`\u0000${two}`);
        index += 2;
      } else {
        words.push(`\u0000${char}`);
        index += 1;
      }
    } else {
      word = (word ?? "") + char;
      index += 1;
    }
  }
  if (word !== null) words.push(word);
  return words;
}

const op = (word: string) => (word.startsWith("\u0000") ? word.slice(1) : null);
const ok = (out = ""): Result => ({ out, err: "", code: 0 });
const fail = (err: string, code = 1): Result => ({ out: "", err: err.endsWith("\n") ? err : `${err}\n`, code });

export function run(repo: Repo, line: string): Result {
  if (line.length > LIMITS.command) return fail(`命令太长（最多 ${LIMITS.command} 个字符）`, 2);
  let words: string[];
  try {
    words = tokenize(line.trim());
  } catch (error) {
    if (error instanceof ParseError) return fail(`bash: ${error.message}`, 2);
    throw error;
  }
  let out = "";
  let err = "";
  let code = 0;
  let clear = false;
  let skip = false;
  let current: string[] = [];
  const flush = (then: string | null) => {
    if (current.length && !skip) {
      const result = command(repo, current);
      out += result.out;
      err += result.err;
      code = result.code;
      if (result.clear) {
        clear = true;
        out = "";
        err = "";
      }
    }
    skip = then === "&&" && code !== 0;
    current = [];
  };
  for (const word of words) {
    const operator = op(word);
    if (operator === "&&" || operator === ";") flush(operator);
    else if (operator === "|" || operator === "||" || operator === "&") return fail(`bash: 这里不支持 ${operator}（这门课的终端只支持 &&、; 和 echo 的 > / >>）`, 2);
    else current.push(word);
  }
  flush(null);
  return { out, err, code, clear };
}

const HELP = `这台练习机支持的命令：
  文件   ls [-a]  cat 文件  echo 文字 > 文件  echo 文字 >> 文件  rm 文件  pwd  clear
  Git    git status  add  commit [-m -a --amend]  log [--oneline --all -p -n]  show  diff [--staged]
         restore [--staged]  reset [--soft --hard]  revert  branch  switch [-c]  checkout
         merge [--abort]  fetch  pull  push  remote -v  blame
也可以在上方的编辑器里直接修改文件，保存后用 git status 查看。
`;

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\/+$/, "");
}

function command(repo: Repo, words: string[]): Result {
  const redirect = words.findIndex((word) => op(word) === ">" || op(word) === ">>");
  if (redirect >= 0) {
    if (words[0] !== "echo") return fail("bash: 这里只有 echo 能把内容写进文件（echo 文字 > 文件）", 2);
    const target = words[redirect + 1];
    if (!target || op(target)) return fail("bash: 语法错误：> 后面要跟文件名", 2);
    const path = normalizePath(target);
    if (!/^[\w.\-/]+$/.test(path) || path.split("/").includes("..")) return fail(`bash: ${target}: 这里只能写仓库里的文件`);
    const text = `${words.slice(1, redirect).join(" ")}\n`;
    const content = op(words[redirect]!) === ">>" ? (repo.work[path] ?? "") + text : text;
    if (content.length > LIMITS.content) return fail("bash: write error: File too large（练习机限制）");
    if (!repo.work[path] && Object.keys(repo.work).length >= LIMITS.files) return fail("bash: 文件太多了（练习机限制）");
    repo.work[path] = content;
    return ok();
  }
  const [name, ...args] = words as [string, ...string[]];
  switch (name) {
    case "git":
      return git(repo, args);
    case "help":
      return ok(HELP);
    case "clear":
      return { out: "", err: "", code: 0, clear: true };
    case "pwd":
      return ok("/home/linke/library-site\n");
    case "echo":
      return ok(`${args.join(" ")}\n`);
    case "ls": {
      const all = args.includes("-a") || args.includes("-la") || args.includes("-al");
      const names = [...new Set(Object.keys(repo.work).map((path) => path.split("/")[0]!))].filter((item) => all || !item.startsWith(".")).sort();
      return ok(`${(all ? [".", "..", ".git", ...names] : names).join("  ")}\n`);
    }
    case "cat": {
      if (!args.length) return fail("cat：这里没有键盘输入，请给出文件名");
      let out = "";
      let err = "";
      for (const arg of args) {
        const path = normalizePath(arg);
        if (repo.work[path] !== undefined) out += repo.work[path];
        else if (Object.keys(repo.work).some((key) => key.startsWith(`${path}/`))) err += `cat: ${arg}: Is a directory\n`;
        else err += `cat: ${arg}: No such file or directory\n`;
      }
      return { out, err, code: err ? 1 : 0 };
    }
    case "rm": {
      const files = args.filter((arg) => !arg.startsWith("-"));
      let err = "";
      for (const arg of files) {
        const path = normalizePath(arg);
        if (repo.work[path] !== undefined) delete repo.work[path];
        else err += `rm: cannot remove '${arg}': No such file or directory\n`;
      }
      return { out: "", err, code: err ? 1 : 0 };
    }
    case "vim":
    case "vi":
    case "nano":
    case "code":
      return fail("这里的终端没有编辑器。改文件请用上方的编辑器，改完点“保存”。", 127);
    default:
      return fail(`bash: ${name}: command not found`, 127);
  }
}

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

function parse(args: string[], withValue: string[] = []) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  let paths: string[] | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (paths) {
      paths.push(arg);
    } else if (arg === "--") {
      paths = [];
    } else if (arg.startsWith("--")) {
      const [key, value] = arg.split("=", 2) as [string, string | undefined];
      if (value !== undefined) values[key] = value;
      else if (withValue.includes(key)) values[key] = args[++index] ?? "";
      else flags.add(key);
    } else if (arg.startsWith("-") && arg.length > 1 && !/^-\d+$/.test(arg)) {
      for (let cursor = 1; cursor < arg.length; cursor += 1) {
        const flag = `-${arg[cursor]}`;
        if (withValue.includes(flag)) {
          values[flag] = arg.slice(cursor + 1) || args[++index] || "";
          break;
        }
        flags.add(flag);
      }
    } else if (/^-\d+$/.test(arg)) {
      values["-n"] = arg.slice(1);
    } else rest.push(arg);
  }
  return { flags, values, rest, paths };
}

function decorate(repo: Repo, id: string, refs: Record<string, string[]>): string {
  return refs[id] ? ` (${refs[id]!.join(", ")})` : "";
}

function logEntry(repo: Repo, commit: Commit, refs: Record<string, string[]>, oneline: boolean): string {
  if (oneline) return `${short(commit.id)}${decorate(repo, commit.id, refs)} ${commit.message.split("\n")[0]}\n`;
  const rows = [`commit ${commit.id}${decorate(repo, commit.id, refs)}`];
  if (commit.parents.length > 1) rows.push(`Merge: ${commit.parents.map(short).join(" ")}`);
  rows.push(`Author: ${commit.author}`, `Date:   ${commit.time}`, "", ...commit.message.split("\n").map((row) => `    ${row}`), "");
  return `${rows.join("\n")}\n`;
}

function parentTree(repo: Repo, commit: Commit): Tree {
  return commit.parents[0] ? repo.commits[commit.parents[0]]!.tree : {};
}

function currentBranch(repo: Repo): string | null {
  return "branch" in repo.head ? repo.head.branch : null;
}

function setHead(repo: Repo, id: string): void {
  if ("branch" in repo.head) repo.branches[repo.head.branch] = id;
  else repo.head = { detached: id };
}

function newCommit(repo: Repo, parents: string[], message: string): Commit {
  repo.clock += 3;
  const commit = makeCommit(repo, parents, repo.index, message, repo.user, timeAt(repo.clock));
  repo.known.add(commit.id);
  setHead(repo, commit.id);
  return commit;
}

function commitSummary(repo: Repo, commit: Commit, root = false): string {
  const branch = currentBranch(repo) ?? "detached HEAD";
  return `[${branch}${root ? " (root-commit)" : ""} ${short(commit.id)}] ${commit.message.split("\n")[0]}\n${stat(parentTree(repo, commit), commit.tree)}`;
}

/** Paths whose working or staged content differs from HEAD. */
function dirtyPaths(repo: Repo): string[] {
  const head = headTree(repo);
  return [...new Set([...Object.keys(head), ...Object.keys(repo.index), ...Object.keys(repo.work)])].filter((path) => {
    if (head[path] === undefined && repo.index[path] === undefined) return false;
    return head[path] !== repo.index[path] || repo.index[path] !== repo.work[path];
  });
}

/** Moves HEAD's tree to `target`, carrying uncommitted changes that do not collide (like git checkout). */
function checkoutTree(repo: Repo, target: Tree, verb: string): Result | null {
  const head = headTree(repo);
  const blocked = dirtyPaths(repo).filter((path) => head[path] !== target[path]);
  if (blocked.length) {
    return fail(`error: Your local changes to the following files would be overwritten by ${verb}:\n${blocked.map((path) => `\t${path}`).join("\n")}\nPlease commit your changes or stash them before you ${verb === "checkout" ? "switch branches" : verb}.\nAborting`);
  }
  const dirty = new Set(dirtyPaths(repo));
  const index: Tree = { ...target };
  const work: Tree = {};
  for (const [path, content] of Object.entries(repo.work)) if (repo.index[path] === undefined && head[path] === undefined) work[path] = content;
  Object.assign(work, target);
  for (const path of dirty) {
    if (repo.index[path] === undefined) delete index[path];
    else index[path] = repo.index[path]!;
    if (repo.work[path] === undefined) delete work[path];
    else work[path] = repo.work[path]!;
  }
  repo.index = index;
  repo.work = work;
  return null;
}

function git(repo: Repo, args: string[]): Result {
  const [sub, ...rest] = args;
  if (!sub) return ok("usage: git <command> [<args>]\n\n这门课用到的命令见 help\n");
  if (sub === "--version" || sub === "version") return ok("git version 2.43.0\n");
  const handler = GIT[sub];
  if (!handler) {
    if (sub === "stash") return fail("这门课不讲 stash：可以先提交到一个新分支上。");
    if (sub === "rebase") return fail("这门课不讲 rebase，用 merge 合并。");
    if (sub === "clone") return fail("仓库已经克隆好了，就在当前目录。");
    return fail(`git: '${sub}' is not a git command. See 'git --help'.`);
  }
  return handler(repo, rest);
}

const GIT: Record<string, (repo: Repo, args: string[]) => Result> = {
  init() {
    return ok("Reinitialized existing Git repository in /home/linke/library-site/.git/\n");
  },

  config(repo, args) {
    if (args[0] === "user.name" && args.length === 1) return ok(`${repo.user.replace(/ <.*$/, "")}\n`);
    if (args[0] === "user.email" && args.length === 1) return ok(`${/<(.*)>/.exec(repo.user)?.[1] ?? ""}\n`);
    return fail("这台练习机的 git 配置已经设好了：git config user.name 可以查看。");
  },

  status(repo, args) {
    return ok(status(repo, args.includes("-s") || args.includes("--short")));
  },

  add(repo, args) {
    const { flags, rest, paths } = parse(args);
    const specs = [...rest, ...(paths ?? [])];
    const all = flags.has("-A") || flags.has("--all");
    if (!specs.length && !all) return fail("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?");
    const force = flags.has("-f") || flags.has("--force");
    const candidates = [...new Set([...Object.keys(repo.work), ...Object.keys(repo.index)])];
    const ignoredHits: string[] = [];
    for (const spec of all ? ["."] : specs) {
      const matched = candidates.filter((path) => matchesPath(spec, path));
      if (!matched.length) return fail(`fatal: pathspec '${spec}' did not match any files`, 128);
      for (const path of matched) {
        const tracked = repo.index[path] !== undefined;
        if (!tracked && isIgnored(repo, path) && !force) {
          if (normalizePath(spec) === path) ignoredHits.push(path);
          continue;
        }
        if (repo.work[path] === undefined) delete repo.index[path];
        else repo.index[path] = repo.work[path]!;
        if (repo.merging) repo.merging.conflicts = repo.merging.conflicts.filter((item) => item !== path);
      }
    }
    if (ignoredHits.length) return fail(`The following paths are ignored by one of your .gitignore files:\n${ignoredHits.join("\n")}\nhint: Use -f if you really want to add them.`);
    return ok();
  },

  commit(repo, args) {
    const { flags, values } = parse(args, ["-m"]);
    const amend = flags.has("--amend");
    const message = values["-m"];
    if (flags.has("-a")) for (const path of Object.keys(repo.index)) {
      if (repo.work[path] === undefined) delete repo.index[path];
      else repo.index[path] = repo.work[path]!;
    }
    const head = headId(repo);
    if (repo.merging) {
      if (repo.merging.conflicts.length) return fail("error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.", 128);
      const parents = repo.merging.kind === "revert" ? [head!] : [head!, repo.merging.theirs];
      const commit = newCommit(repo, parents, message ?? repo.merging.message);
      repo.merging = null;
      return ok(commitSummary(repo, commit));
    }
    if (message !== undefined && message.trim() === "") return fail("Aborting commit due to empty commit message.");
    if (amend) {
      if (!head) return fail("fatal: You have nothing to amend.", 128);
      const old = repo.commits[head]!;
      repo.events.push(`amend:${head}`);
      const commit = newCommit(repo, old.parents, message ?? old.message);
      return ok(commitSummary(repo, commit));
    }
    if (message === undefined) return fail('这里没有编辑器：请用 git commit -m "说明"。');
    if (head && sameTree(repo.index, headTree(repo))) return { out: status(repo, false), err: "", code: 1 };
    const commit = newCommit(repo, head ? [head] : [], message);
    return ok(commitSummary(repo, commit, !head));
  },

  log(repo, args) {
    const { flags, values, rest, paths } = parse(args, ["-n", "--author"]);
    const oneline = flags.has("--oneline");
    const all = flags.has("--all");
    const patch = flags.has("-p") || flags.has("--patch");
    const showStat = flags.has("--stat");
    const limit = values["-n"] !== undefined ? Number(values["-n"]) : Infinity;
    const revs = rest.filter((item) => resolveRev(repo, item));
    const filePaths = [...(paths ?? []), ...rest.filter((item) => !resolveRev(repo, item))];
    for (const item of filePaths) if (!Object.keys(repo.work).concat(Object.keys(headTree(repo))).some((path) => matchesPath(item, path))) return fail(`fatal: ambiguous argument '${item}': unknown revision or path not in the working tree.`, 128);
    const tips = all ? localTips(repo) : revs.length ? revs.map((rev) => resolveRev(repo, rev)!) : [headId(repo)].filter((id): id is string => Boolean(id));
    if (!tips.length) return fail("fatal: your current branch does not have any commits yet", 128);
    const refs = refsAt(repo);
    let commits = history(repo, tips);
    if (values["--author"]) commits = commits.filter((commit) => commit.author.toLowerCase().includes(values["--author"]!.toLowerCase()));
    if (filePaths.length) commits = commits.filter((commit) => Object.keys({ ...commit.tree, ...parentTree(repo, commit) }).some((path) => filePaths.some((spec) => matchesPath(spec, path)) && commit.tree[path] !== parentTree(repo, commit)[path]));
    const out = commits.slice(0, limit).map((commit) => {
      let entry = logEntry(repo, commit, refs, oneline);
      if (oneline && flags.has("--graph")) entry = `* ${entry}`;
      if (showStat) entry += `${stat(parentTree(repo, commit), commit.tree)}\n`;
      if (patch) entry += `${treeDiff(parentTree(repo, commit), commit.tree, filePaths.length ? filePaths : undefined)}\n`;
      return entry;
    });
    return ok(out.join(""));
  },

  show(repo, args) {
    const { flags, rest } = parse(args);
    const rev = rest[0] ?? "HEAD";
    if (rev.includes(":")) {
      const [revPart, path] = rev.split(":", 2) as [string, string];
      const id = resolveRev(repo, revPart || "HEAD");
      if (!id) return fail(`fatal: invalid object name '${revPart}'.`, 128);
      const content = repo.commits[id]!.tree[path];
      return content === undefined ? fail(`fatal: path '${path}' does not exist in '${revPart}'`, 128) : ok(content);
    }
    const id = resolveRev(repo, rev);
    if (!id) return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`, 128);
    const commit = repo.commits[id]!;
    const body = logEntry(repo, commit, refsAt(repo), false);
    if (flags.has("--stat")) return ok(`${body}${stat(parentTree(repo, commit), commit.tree)}`);
    return ok(`${body}${commit.parents.length > 1 ? "" : treeDiff(parentTree(repo, commit), commit.tree)}`);
  },

  diff(repo, args) {
    const { flags, rest, paths } = parse(args);
    const revs = rest.filter((item) => resolveRev(repo, item));
    const files = [...(paths ?? []), ...rest.filter((item) => !resolveRev(repo, item))];
    const filter = files.length ? files : undefined;
    if (flags.has("--staged") || flags.has("--cached")) return ok(treeDiff(revs[0] ? repo.commits[resolveRev(repo, revs[0])!]!.tree : headTree(repo), repo.index, filter));
    if (revs.length >= 2) return ok(treeDiff(repo.commits[resolveRev(repo, revs[0]!)!]!.tree, repo.commits[resolveRev(repo, revs[1]!)!]!.tree, filter));
    if (revs.length === 1) return ok(treeDiff(repo.commits[resolveRev(repo, revs[0]!)!]!.tree, trackedWork(repo), filter));
    const index: Tree = { ...repo.index };
    return ok(treeDiff(index, trackedWork(repo), filter));
  },

  restore(repo, args) {
    const { flags, values, rest, paths } = parse(args, ["-s", "--source"]);
    const specs = [...rest, ...(paths ?? [])];
    if (!specs.length) return fail("fatal: you must specify path(s) to restore", 128);
    const staged = flags.has("--staged") || flags.has("-S");
    const sourceRev = values["--source"] ?? values["-s"];
    const sourceId = sourceRev ? resolveRev(repo, sourceRev) : undefined;
    if (sourceRev && !sourceId) return fail(`fatal: could not resolve ${sourceRev}`, 128);
    const source = sourceId ? repo.commits[sourceId]!.tree : staged ? headTree(repo) : repo.index;
    for (const spec of specs) {
      const pool = new Set([...Object.keys(source), ...Object.keys(staged ? repo.index : repo.work)]);
      const matched = [...pool].filter((path) => matchesPath(spec, path) && (staged || repo.index[path] !== undefined || source[path] !== undefined));
      if (!matched.length) return fail(`error: pathspec '${spec}' did not match any file(s) known to git`);
      for (const path of matched) {
        const target = staged ? repo.index : repo.work;
        if (source[path] === undefined) delete target[path];
        else target[path] = source[path]!;
        if (flags.has("--worktree") && staged) {
          if (source[path] === undefined) delete repo.work[path];
          else repo.work[path] = source[path]!;
        }
      }
    }
    return ok();
  },

  reset(repo, args) {
    const { flags, rest, paths } = parse(args);
    const mode = flags.has("--hard") ? "hard" : flags.has("--soft") ? "soft" : "mixed";
    const files = [...(paths ?? []), ...rest.filter((item) => !resolveRev(repo, item))];
    if (files.length) return GIT.restore!(repo, ["--staged", ...files]);
    const rev = rest[0] ?? "HEAD";
    const id = resolveRev(repo, rev);
    if (!id) return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`, 128);
    repo.events.push(`reset:${mode}:${id}`);
    const tree = repo.commits[id]!.tree;
    const untracked = untrackedOnly(repo, repo.work);
    setHead(repo, id);
    repo.merging = null;
    if (mode !== "soft") repo.index = { ...tree };
    if (mode === "hard") {
      repo.work = { ...untracked, ...tree };
      return ok(`HEAD is now at ${short(id)} ${repo.commits[id]!.message.split("\n")[0]}\n`);
    }
    const unstaged = fileStates(repo).filter((state) => state.unstaged);
    return ok(unstaged.length ? `Unstaged changes after reset:\n${unstaged.map((state) => `M\t${state.path}`).join("\n")}\n` : "");
  },

  revert(repo, args) {
    const { rest } = parse(args);
    const rev = rest[0];
    if (!rev) return fail("usage: git revert <commit>");
    if (repo.merging) return fail("error: 先完成或放弃正在进行的合并（git merge --abort）。");
    const id = resolveRev(repo, rev);
    if (!id) return fail(`fatal: bad revision '${rev}'`, 128);
    const target = repo.commits[id]!;
    if (target.parents.length > 1) return fail(`error: commit ${id} is a merge but no -m option was given.\nfatal: revert failed`, 128);
    if (!sameTree(repo.index, headTree(repo)) || dirtyPaths(repo).some((path) => target.tree[path] !== parentTree(repo, target)[path])) {
      return fail("error: Your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed", 128);
    }
    const message = `Revert "${target.message.split("\n")[0]}"\n\nThis reverts commit ${id}.`;
    const merged = mergeTrees(target.tree, headTree(repo), parentTree(repo, target), ["HEAD", `parent of ${short(id)} (${target.message.split("\n")[0]})`]);
    const dirty = dirtyPaths(repo).map((path) => [path, repo.index[path], repo.work[path]] as const);
    applyMerged(repo, merged.tree);
    for (const [path, staged, working] of dirty) {
      if (staged === undefined) delete repo.index[path];
      else repo.index[path] = staged;
      if (working === undefined) delete repo.work[path];
      else repo.work[path] = working;
    }
    if (merged.conflicts.length) {
      repo.merging = { kind: "revert", theirs: id, label: "revert", message, conflicts: merged.conflicts };
      for (const path of merged.conflicts) repo.index[path] = headTree(repo)[path] ?? "";
      return fail(`${merged.conflicts.map((path) => `CONFLICT (content): Merge conflict in ${path}`).join("\n")}\nerror: could not revert ${short(id)}... ${target.message.split("\n")[0]}\nhint: After resolving the conflicts, mark them with "git add <paths>" and run "git commit".`);
    }
    repo.events.push(`revert:${id}`);
    const commit = newCommit(repo, [headId(repo)!], message);
    return ok(commitSummary(repo, commit));
  },

  branch(repo, args) {
    const { flags, rest } = parse(args);
    if (flags.has("-d") || flags.has("-D")) {
      const name = rest[0];
      if (!name || !repo.branches[name]) return fail(`error: branch '${name ?? ""}' not found.`);
      if (currentBranch(repo) === name) return fail(`error: Cannot delete branch '${name}' checked out at '/home/linke/library-site'`);
      if (!flags.has("-D") && !isAncestor(repo, repo.branches[name]!, headId(repo)!)) return fail(`error: The branch '${name}' is not fully merged.\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'`);
      const id = repo.branches[name]!;
      delete repo.branches[name];
      return ok(`Deleted branch ${name} (was ${short(id)}).\n`);
    }
    if (rest.length) {
      const [name, start] = rest as [string, string | undefined];
      if (!/^[\w./-]+$/.test(name) || name.includes("..")) return fail(`fatal: '${name}' is not a valid branch name`, 128);
      if (repo.branches[name]) return fail(`fatal: a branch named '${name}' already exists`, 128);
      const id = resolveRev(repo, start ?? "HEAD");
      if (!id) return fail(`fatal: not a valid object name: '${start ?? "HEAD"}'`, 128);
      repo.branches[name] = id;
      return ok();
    }
    const rows = Object.keys(repo.branches)
      .sort()
      .map((name) => `${currentBranch(repo) === name ? "*" : " "} ${name}${flags.has("-v") ? ` ${short(repo.branches[name]!)} ${repo.commits[repo.branches[name]!]!.message.split("\n")[0]}` : ""}`);
    if ("detached" in repo.head) rows.unshift(`* (HEAD detached at ${short(repo.head.detached)})`);
    if (flags.has("-a") || flags.has("-r")) {
      const remotes = Object.keys(repo.tracking)
        .sort()
        .map((name) => `  remotes/origin/${name}`);
      return ok(`${(flags.has("-r") ? remotes.map((row) => row.replace("remotes/", "")) : [...rows, ...remotes]).join("\n")}\n`);
    }
    return ok(`${rows.join("\n")}\n`);
  },

  switch(repo, args) {
    const { flags, values, rest } = parse(args, ["-c", "-C"]);
    const create = values["-c"] ?? values["-C"];
    if (repo.merging) return fail("fatal: 合并还没完成：先 git commit 结束合并，或 git merge --abort 放弃。", 128);
    if (create !== undefined) {
      if (!create) return fail("error: switch `c' requires a value");
      const made = GIT.branch!(repo, [create, ...(rest[0] ? [rest[0]] : [])]);
      if (made.code) return made;
      const blocked = checkoutTree(repo, repo.commits[repo.branches[create]!]!.tree, "checkout");
      if (blocked) {
        delete repo.branches[create];
        return blocked;
      }
      repo.head = { branch: create };
      return { out: "", err: `Switched to a new branch '${create}'\n`, code: 0 };
    }
    const name = rest[0];
    if (!name || name === "-") return fail("这里请写出要切换到的分支名，例如 git switch main", 128);
    if (flags.has("--detach")) return GIT.checkout!(repo, [name]);
    if (!repo.branches[name]) {
      if (repo.tracking[name]) {
        repo.branches[name] = repo.tracking[name]!;
        repo.upstream[name] = name;
      } else return fail(`fatal: invalid reference: ${name}`, 128);
    }
    if (currentBranch(repo) === name) return { out: "", err: `Already on '${name}'\n`, code: 0 };
    const blocked = checkoutTree(repo, repo.commits[repo.branches[name]!]!.tree, "checkout");
    if (blocked) return blocked;
    repo.head = { branch: name };
    repo.events.push(`switch:${name}`);
    return { out: "", err: `Switched to branch '${name}'\n`, code: 0 };
  },

  checkout(repo, args) {
    const { values, rest, paths } = parse(args, ["-b"]);
    if (values["-b"] !== undefined) return GIT.switch!(repo, ["-c", values["-b"], ...rest]);
    if (paths?.length) return GIT.restore!(repo, paths);
    const target = rest[0];
    if (!target) return fail("这里请写 git checkout 分支名，或 git checkout -- 文件");
    if (repo.branches[target] || repo.tracking[target]) return GIT.switch!(repo, [target]);
    const id = resolveRev(repo, target);
    if (id) {
      const blocked = checkoutTree(repo, repo.commits[id]!.tree, "checkout");
      if (blocked) return blocked;
      repo.head = { detached: id };
      return { out: "", err: `Note: switching to '${target}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nHEAD is now at ${short(id)} ${repo.commits[id]!.message.split("\n")[0]}\n`, code: 0 };
    }
    return GIT.restore!(repo, rest);
  },

  merge(repo, args) {
    const { flags, values, rest } = parse(args, ["-m"]);
    if (flags.has("--abort")) {
      if (!repo.merging) return fail("fatal: There is no merge to abort (MERGE_HEAD missing).", 128);
      const untracked = untrackedOnly(repo, repo.work);
      repo.merging = null;
      repo.index = { ...headTree(repo) };
      repo.work = { ...untracked, ...headTree(repo) };
      return ok();
    }
    if (repo.merging) return fail("error: Merging is not possible because you have unmerged files.\nfatal: Exiting because of an unresolved conflict.", 128);
    const name = rest[0];
    if (!name) return fail("fatal: No remote for the current branch.", 128);
    const theirs = resolveRev(repo, name);
    if (!theirs) return fail(`merge: ${name} - not something we can merge`);
    return mergeInto(repo, theirs, name, values["-m"], flags.has("--no-ff"));
  },

  fetch(repo) {
    const rows: string[] = [];
    for (const [name, id] of Object.entries(repo.remote)) {
      const before = repo.tracking[name];
      if (before === id) continue;
      for (const seen of ancestors(repo, id)) repo.known.add(seen);
      repo.tracking[name] = id;
      rows.push(before ? `   ${short(before)}..${short(id)}  ${name.padEnd(10)} -> origin/${name}` : ` * [new branch]      ${name.padEnd(10)} -> origin/${name}`);
    }
    repo.events.push("fetch");
    return { out: "", err: rows.length ? `From ${REMOTE_URL}\n${rows.join("\n")}\n` : "", code: 0 };
  },

  pull(repo, args) {
    const { flags } = parse(args);
    if (flags.has("--rebase") || flags.has("-r")) return fail("这门课不讲 rebase：直接用 git pull（合并）。");
    const branch = currentBranch(repo);
    if (!branch) return fail("You are not currently on a branch.", 1);
    const upstream = repo.upstream[branch];
    if (!upstream) return fail(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\n\n    git branch --set-upstream-to=origin/${branch} ${branch}`);
    const fetched = GIT.fetch!(repo, []);
    const merged = mergeInto(repo, repo.tracking[upstream]!, `origin/${upstream}`, undefined, false, true);
    return { out: merged.out, err: fetched.err + merged.err, code: merged.code };
  },

  push(repo, args) {
    const { flags, rest } = parse(args);
    const force = flags.has("--force") || flags.has("-f") || flags.has("--force-with-lease");
    const remoteName = rest[0] ?? "origin";
    if (remoteName !== "origin") return fail(`fatal: '${remoteName}' does not appear to be a git repository`, 128);
    const branch = rest[1] ?? currentBranch(repo);
    if (!branch || !repo.branches[branch]) return fail(`error: src refspec ${branch ?? "HEAD"} does not match any`);
    const local = repo.branches[branch]!;
    const remoteId = repo.remote[branch];
    if (!rest[1] && !repo.upstream[branch] && !flags.has("-u") && !flags.has("--set-upstream")) {
      return fail(`fatal: The current branch ${branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push -u origin ${branch}\n`, 128);
    }
    const to = `To ${REMOTE_URL}`;
    let line: string;
    if (remoteId === local) return { out: "", err: "Everything up-to-date\n", code: 0 };
    if (!remoteId) line = ` * [new branch]      ${branch} -> ${branch}`;
    else if (isAncestor(repo, remoteId, local)) line = `   ${short(remoteId)}..${short(local)}  ${branch} -> ${branch}`;
    else if (force) {
      repo.events.push(`force-push:${branch}:${remoteId}`);
      line = ` + ${short(remoteId)}...${short(local)} ${branch} -> ${branch} (forced update)`;
    } else {
      const fetchFirst = !repo.known.has(remoteId);
      return fail(
        `${to}\n ! [rejected]        ${branch} -> ${branch} (${fetchFirst ? "fetch first" : "non-fast-forward"})\nerror: failed to push some refs to '${REMOTE_URL}'\n` +
          (fetchFirst
            ? "hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\n"
            : "hint: Updates were rejected because the tip of your current branch is behind\nhint: its remote counterpart. If you want to integrate the remote changes,\nhint: use 'git pull' before pushing again.\n"),
      );
    }
    repo.remote[branch] = local;
    repo.tracking[branch] = local;
    if (flags.has("-u") || flags.has("--set-upstream")) repo.upstream[branch] = branch;
    repo.events.push(`push:${branch}:${local}`);
    return { out: "", err: `${to}\n${line}\n${flags.has("-u") ? `branch '${branch}' set up to track 'origin/${branch}'.\n` : ""}`, code: 0 };
  },

  remote(repo, args) {
    if (args[0] === "-v") return ok(`origin\t${REMOTE_URL} (fetch)\norigin\t${REMOTE_URL} (push)\n`);
    return ok("origin\n");
  },

  blame(repo, args) {
    const path = args.filter((arg) => !arg.startsWith("-"))[0];
    if (!path) return fail("usage: git blame <file>");
    const id = headId(repo);
    if (!id || repo.commits[id]!.tree[path] === undefined) return fail(`fatal: no such path '${path}' in HEAD`, 128);
    const owners = blame(repo, id, path);
    const lines = splitLines(repo.commits[id]!.tree[path]!);
    return ok(
      lines
        .map((row, index) => {
          const commit = repo.commits[owners[index]!]!;
          return `${short(commit.id)} (${commit.author.replace(/ <.*$/, "").padEnd(3)} ${commit.time.slice(0, 10)} ${String(index + 1).padStart(2)}) ${row}`;
        })
        .join("\n") + "\n",
    );
  },
};

function sameTree(a: Tree, b: Tree): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function untrackedOnly(repo: Repo, work: Tree): Tree {
  const head = headTree(repo);
  return Object.fromEntries(Object.entries(work).filter(([path]) => repo.index[path] === undefined && head[path] === undefined));
}

function trackedWork(repo: Repo): Tree {
  return Object.fromEntries(Object.entries(repo.work).filter(([path]) => repo.index[path] !== undefined || repo.merging?.conflicts.includes(path)));
}

function applyMerged(repo: Repo, tree: Tree): void {
  const untracked = untrackedOnly(repo, repo.work);
  repo.index = { ...tree };
  repo.work = { ...untracked, ...tree };
}

function mergeInto(repo: Repo, theirs: string, label: string, message: string | undefined, noFf: boolean, fromPull = false): Result {
  const ours = headId(repo)!;
  if (isAncestor(repo, theirs, ours)) return ok("Already up to date.\n");
  const target = repo.commits[theirs]!;
  const base = mergeBase(repo, ours, theirs);
  const touched = Object.keys({ ...headTree(repo), ...target.tree }).filter((path) => headTree(repo)[path] !== target.tree[path]);
  if (!sameTree(repo.index, headTree(repo))) return fail("error: 你有已暂存、还没提交的改动。先提交（或 git restore --staged 取消暂存）再合并。");
  const blocked = dirtyPaths(repo).filter((path) => touched.includes(path));
  if (blocked.length) return fail(`error: Your local changes to the following files would be overwritten by merge:\n${blocked.map((path) => `\t${path}`).join("\n")}\nPlease commit your changes or stash them before you merge.\nAborting`);
  if (isAncestor(repo, ours, theirs) && !noFf) {
    const changes = stat(headTree(repo), target.tree);
    const result = checkoutTree(repo, target.tree, "merge");
    if (result) return result;
    setHead(repo, theirs);
    repo.events.push(`merge-ff:${theirs}`);
    return ok(`Updating ${short(ours)}..${short(theirs)}\nFast-forward\n${changes}`);
  }
  const branch = currentBranch(repo) ?? "HEAD";
  const defaultMessage = message ?? (fromPull ? `Merge branch '${branch}' of ${REMOTE_URL}` : `Merge branch '${label}'${branch === "main" ? "" : ` into ${branch}`}`);
  const merged = mergeTrees(base ? repo.commits[base]!.tree : {}, headTree(repo), target.tree, ["HEAD", label]);
  const dirty = Object.fromEntries(dirtyPaths(repo).map((path) => [path, repo.work[path]]));
  applyMerged(repo, merged.tree);
  for (const [path, content] of Object.entries(dirty)) if (content !== undefined) repo.work[path] = content;
  const baseTree = base ? repo.commits[base]!.tree : {};
  const autos = touched.filter((path) => ours !== theirs && baseTree[path] !== repo.commits[ours]!.tree[path] && baseTree[path] !== target.tree[path] && repo.commits[ours]!.tree[path] !== undefined && target.tree[path] !== undefined);
  const auto = autos.map((path) => `Auto-merging ${path}\n`).join("");
  if (merged.conflicts.length) {
    repo.merging = { kind: "merge", theirs, label, message: defaultMessage, conflicts: merged.conflicts };
    for (const path of merged.conflicts) repo.index[path] = headTree(repo)[path] ?? "";
    repo.events.push(`merge-conflict:${theirs}`);
    return { out: `${auto}${merged.conflicts.map((path) => `CONFLICT (content): Merge conflict in ${path}\n`).join("")}Automatic merge failed; fix conflicts and then commit the result.\n`, err: "", code: 1 };
  }
  const before = headTree(repo);
  const commit = newCommit(repo, [ours, theirs], defaultMessage);
  repo.events.push(`merge:${theirs}`);
  return ok(`${auto}Merge made by the 'ort' strategy.\n${stat(before, commit.tree)}`);
}

/** Which commit last changed each line of `path` at `id`, following first parents. */
function blame(repo: Repo, id: string, path: string): string[] {
  const commit = repo.commits[id]!;
  const lines = splitLines(commit.tree[path] ?? "");
  const parentId = commit.parents[0];
  const parent = parentId ? repo.commits[parentId]!.tree[path] : undefined;
  if (!parentId || parent === undefined) return lines.map(() => id);
  const upstream = blame(repo, parentId, path);
  const owners = lines.map(() => id);
  for (const op of diffLines(splitLines(parent), lines)) if (op.kind === "same") owners[op.b] = upstream[op.a]!;
  return owners;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type Transcript = { command: string; out: string; err: string; clear: boolean; edit: boolean }[];

export function applyAction(repo: Repo, action: Action): Result & { edit: boolean } {
  if (typeof action === "string") return { ...run(repo, action), edit: false };
  const path = normalizePath(action.edit);
  if (action.content === "") delete repo.work[path];
  else repo.work[path] = action.content.endsWith("\n") ? action.content : `${action.content}\n`;
  return { out: "", err: "", code: 0, edit: true };
}

/** Replays an action history on a fresh repository. */
export function replay(create: () => Repo, actions: readonly Action[]): { repo: Repo; transcript: Transcript } {
  const repo = create();
  const transcript: Transcript = [];
  for (const action of actions.slice(0, LIMITS.history)) {
    const result = applyAction(repo, action);
    transcript.push({ command: typeof action === "string" ? action : action.edit, out: result.out, err: result.err, clear: result.clear === true, edit: result.edit });
  }
  return { repo, transcript };
}
