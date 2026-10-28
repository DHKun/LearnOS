/**
 * A small, deterministic Unix-like machine for the command-line course: a file
 * tree with owners and modes, a few users and processes, and a shell that
 * understands a whitelisted subset of bash (quotes, variables, globs, pipes,
 * redirection, `&&` and `;`).
 *
 * Nothing real is executed. Every command is a plain function over this
 * in-memory model, shared by the browser labs and the server-side validators,
 * which replay a student's command history on a fresh machine.
 */

export type User = "root" | "ops" | "www-data" | "deploy" | "guest" | "postgres";

export const USERS: Record<User, { uid: number; groups: string[]; home: string }> = {
  root: { uid: 0, groups: ["root"], home: "/root" },
  ops: { uid: 1001, groups: ["ops", "web"], home: "/home/ops" },
  deploy: { uid: 1002, groups: ["deploy"], home: "/home/deploy" },
  guest: { uid: 1003, groups: ["guest"], home: "/home/guest" },
  "www-data": { uid: 33, groups: ["www-data", "web"], home: "/var/www" },
  postgres: { uid: 112, groups: ["postgres"], home: "/var/lib/postgresql" },
};

const GIDS: Record<string, number> = { root: 0, ops: 1001, deploy: 1002, guest: 1003, web: 1010, "www-data": 33, postgres: 112 };

export function isUser(name: string): name is User {
  return Object.prototype.hasOwnProperty.call(USERS, name);
}

export type Entry = {
  type: "dir" | "file";
  owner: User;
  group: string;
  mode: number;
  content: string;
  /** Logical size in bytes when it differs from the content (huge logs, binaries). */
  size?: number;
  /** For executables: which simulated program runs. */
  program?: string;
  time: string;
};

export type Fs = Record<string, Entry>;

export type Proc = {
  pid: number;
  user: User;
  name: string;
  command: string;
  start: string;
  cpu: string;
  mem: string;
  port?: number;
  /** Paths this process keeps open; deleting them does not free the space. */
  holds: string[];
  service?: string;
};

export type Service = { state: "active" | "failed" | "inactive"; pid?: number; log: string[]; description: string };

export type Signal = "TERM" | "KILL" | "HUP" | "INT";

export type Machine = {
  fs: Fs;
  cwd: string;
  oldCwd: string;
  user: User;
  hostname: string;
  clock: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  procs: Proc[];
  nextPid: number;
  services: Record<string, Service>;
  disk: { total: number; base: number };
  /** Files removed while a process still had them open. */
  unlinked: { size: number; pid: number; path: string }[];
  /** Things that happened, for graders (e.g. `kill:812:KILL`). */
  events: string[];
  lastCode: number;
  hooks: {
    /** A process received a signal; return false to ignore it. */
    signal?: (m: Machine, proc: Proc, signal: Signal) => boolean;
    /** `systemctl start`; returns an error message when it fails. */
    startService?: (m: Machine, name: string) => string | null;
    program?: (m: Machine, program: string, args: string[]) => Result | null;
    curl?: (m: Machine, path: string) => { status: number; headers: string[]; body: string } | null;
  };
};

export type Result = { out: string; err: string; code: number; clear?: boolean };

export const LIMITS = { line: 300, history: 40, file: 400_000, stages: 8, depth: 3 };

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/** Absolute, normalized path; `~` must already be expanded. */
export function resolve(cwd: string, path: string): string {
  return normalize(path.startsWith("/") ? path : `${cwd}/${path}`);
}

export function parentOf(path: string): string {
  if (path === "/") return "/";
  return path.slice(0, path.lastIndexOf("/")) || "/";
}

export function baseName(path: string): string {
  return path === "/" ? "/" : path.slice(path.lastIndexOf("/") + 1);
}

export function join(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function childrenOf(fs: Fs, dir: string): string[] {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  return Object.keys(fs)
    .filter((key) => key !== "/" && key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
    .map((key) => key.slice(prefix.length))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function descendants(fs: Fs, dir: string): string[] {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  return Object.keys(fs).filter((key) => key !== dir && key.startsWith(prefix));
}

/** Expands a leading `~` or `~user` as bash does. */
export function expandTilde(word: string, home: string): string {
  if (!word.startsWith("~")) return word;
  const slash = word.indexOf("/");
  const name = slash === -1 ? word.slice(1) : word.slice(1, slash);
  const rest = slash === -1 ? "" : word.slice(slash);
  if (name === "") return home + rest;
  return isUser(name) ? USERS[name].home + rest : word;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type Need = "r" | "w" | "x";
const NEED_BIT: Record<Need, number> = { r: 4, w: 2, x: 1 };

/** The rwx triplet that applies to `user` for this entry: owner, group or other. */
export function classOf(entry: Entry, user: User): "owner" | "group" | "other" {
  if (entry.owner === user) return "owner";
  if (USERS[user].groups.includes(entry.group)) return "group";
  return "other";
}

export function allowed(entry: Entry, user: User, need: Need): boolean {
  if (user === "root") return need !== "x" || entry.type === "dir" || (entry.mode & 0o111) !== 0;
  const shift = { owner: 6, group: 3, other: 0 }[classOf(entry, user)];
  return ((entry.mode >> shift) & NEED_BIT[need]) !== 0;
}

export function modeString(entry: Entry): string {
  const triplet = (bits: number) => `${bits & 4 ? "r" : "-"}${bits & 2 ? "w" : "-"}${bits & 1 ? "x" : "-"}`;
  return `${entry.type === "dir" ? "d" : "-"}${triplet(entry.mode >> 6)}${triplet(entry.mode >> 3)}${triplet(entry.mode)}`;
}

export type Code = "ENOENT" | "EACCES" | "ENOTDIR" | "EISDIR" | "EEXIST" | "ENOTEMPTY" | "EPERM";
const MESSAGES: Record<Code, string> = {
  ENOENT: "No such file or directory",
  EACCES: "Permission denied",
  ENOTDIR: "Not a directory",
  EISDIR: "Is a directory",
  EEXIST: "File exists",
  ENOTEMPTY: "Directory not empty",
  EPERM: "Operation not permitted",
};

/** Walks to `abs` as `user`: every directory on the way must exist and allow `x`. */
export function lookup(fs: Fs, user: User, abs: string): { entry: Entry } | { error: Code } {
  if (abs === "/") return { entry: fs["/"]! };
  const parts = abs.split("/").filter(Boolean);
  let current = "/";
  for (let index = 0; index < parts.length; index += 1) {
    const dir = fs[current];
    if (!dir) return { error: "ENOENT" };
    if (dir.type !== "dir") return { error: "ENOTDIR" };
    if (!allowed(dir, user, "x")) return { error: "EACCES" };
    current = join(current, parts[index]!);
  }
  const entry = fs[current];
  return entry ? { entry } : { error: "ENOENT" };
}

/** Can `user` reach `abs` and does the entry grant `need`? */
export function can(fs: Fs, user: User, abs: string, need: Need): boolean {
  const found = lookup(fs, user, abs);
  return "entry" in found && allowed(found.entry, user, need);
}

// ---------------------------------------------------------------------------
// Sizes and the disk
// ---------------------------------------------------------------------------

export function byteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function sizeOf(entry: Entry): number {
  if (entry.type === "dir") return 4096;
  return entry.size ?? byteLength(entry.content);
}

export function human(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return value < 10 ? `${Math.ceil(value * 10) / 10}${units[unit]}`.replace(/(\.\d)\d+/, "$1") : `${Math.ceil(value)}${units[unit]}`;
}

export function diskUsed(m: Machine): number {
  let total = m.disk.base;
  for (const entry of Object.values(m.fs)) if (entry.type === "file") total += sizeOf(entry);
  for (const item of m.unlinked) total += item.size;
  return Math.min(total, m.disk.total);
}

export function diskPercent(m: Machine): number {
  return Math.ceil((diskUsed(m) / m.disk.total) * 100);
}

/** Sets the unmodelled part of the disk so that the machine starts at `percent`. */
export function fillDisk(m: Machine, percent: number): void {
  m.disk.base = 0;
  m.disk.base = Math.max(0, Math.round((m.disk.total * percent) / 100) - diskUsed(m));
}

// ---------------------------------------------------------------------------
// File operations (as the current user)
// ---------------------------------------------------------------------------

function canModifyDir(m: Machine, dir: string): Code | null {
  const found = lookup(m.fs, m.user, dir);
  if ("error" in found) return found.error;
  if (found.entry.type !== "dir") return "ENOTDIR";
  if (!allowed(found.entry, m.user, "w") || !allowed(found.entry, m.user, "x")) return "EACCES";
  return null;
}

/** Writes (or appends) text to a file, creating it if needed. */
export function writeFile(m: Machine, abs: string, text: string, append: boolean): Code | "EFBIG" | null {
  if (abs === "/dev/null") return null;
  const found = lookup(m.fs, m.user, abs);
  if ("entry" in found) {
    const entry = found.entry;
    if (entry.type === "dir") return "EISDIR";
    if (!allowed(entry, m.user, "w")) return "EACCES";
    const content = append ? entry.content + text : text;
    if (byteLength(content) > LIMITS.file) return "EFBIG";
    const grown = append && entry.size !== undefined ? entry.size + byteLength(text) : undefined;
    m.fs[abs] = { ...entry, content, size: grown, time: m.clock };
    return null;
  }
  if (found.error !== "ENOENT") return found.error;
  const problem = canModifyDir(m, parentOf(abs));
  if (problem) return problem;
  if (byteLength(text) > LIMITS.file) return "EFBIG";
  m.fs[abs] = { type: "file", owner: m.user, group: USERS[m.user].groups[0]!, mode: 0o644, content: text, time: m.clock };
  return null;
}

function readFile(m: Machine, abs: string): { text: string } | { error: Code } {
  if (abs === "/dev/null") return { text: "" };
  const found = lookup(m.fs, m.user, abs);
  if ("error" in found) return found;
  if (found.entry.type === "dir") return { error: "EISDIR" };
  if (!allowed(found.entry, m.user, "r")) return { error: "EACCES" };
  return { text: found.entry.content };
}

function holderOf(m: Machine, abs: string): Proc | undefined {
  return m.procs.find((proc) => proc.holds.includes(abs));
}

function removePath(m: Machine, abs: string): void {
  for (const key of [abs, ...descendants(m.fs, abs)]) {
    const entry = m.fs[key]!;
    const holder = entry.type === "file" ? holderOf(m, key) : undefined;
    if (holder) {
      m.unlinked.push({ size: sizeOf(entry), pid: holder.pid, path: key });
      holder.holds = holder.holds.filter((path) => path !== key);
    }
    delete m.fs[key];
  }
}

function movePath(m: Machine, from: string, to: string): void {
  for (const key of [from, ...descendants(m.fs, from)]) {
    const target = to + key.slice(from.length);
    m.fs[target] = m.fs[key]!;
    delete m.fs[key];
    for (const proc of m.procs) proc.holds = proc.holds.map((path) => (path === key ? target : path));
  }
}

function copyPath(m: Machine, from: string, to: string): void {
  for (const key of [from, ...descendants(m.fs, from)]) {
    const source = m.fs[key]!;
    m.fs[to + key.slice(from.length)] = { ...source, owner: m.user, group: USERS[m.user].groups[0]!, time: m.clock };
  }
}

/** Ends a process and releases what it held. */
export function endProcess(m: Machine, pid: number): void {
  const proc = m.procs.find((item) => item.pid === pid);
  if (!proc) return;
  m.procs = m.procs.filter((item) => item.pid !== pid);
  m.unlinked = m.unlinked.filter((item) => item.pid !== pid);
  for (const service of Object.values(m.services)) {
    if (service.pid === pid) {
      service.pid = undefined;
      if (service.state === "active") service.state = "inactive";
    }
  }
}

export function spawn(m: Machine, proc: Omit<Proc, "pid">): Proc {
  const created = { ...proc, pid: m.nextPid };
  m.nextPid += 7;
  m.procs.push(created);
  return created;
}

// ---------------------------------------------------------------------------
// Tokenizer and parser
// ---------------------------------------------------------------------------

type Part = { text: string; quote: "" | "'" | '"' };
type Token = { kind: "word"; parts: Part[] } | { kind: "op"; op: string };
type Redirect = { op: ">" | ">>" | "2>" | "2>>" | "<" | "2>&1"; target?: Token & { kind: "word" } };
type Stage = { words: (Token & { kind: "word" })[]; redirects: Redirect[] };
type Chain = { stages: Stage[]; then: ";" | "&&" | null }[];

class SyntaxError_ extends Error {}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let word: Part[] | null = null;
  const push = (text: string, quote: Part["quote"]) => {
    word ??= [];
    const last = word[word.length - 1];
    if (last && last.quote === quote) last.text += text;
    else word.push({ text, quote });
  };
  const end = () => {
    if (word) tokens.push({ kind: "word", parts: word });
    word = null;
  };
  let index = 0;
  while (index < line.length) {
    const char = line[index]!;
    const next = line[index + 1];
    if (char === " " || char === "\t") {
      end();
      index += 1;
    } else if (char === "'") {
      const close = line.indexOf("'", index + 1);
      if (close === -1) throw new SyntaxError_("引号没有配对：缺少结尾的 '");
      push(line.slice(index + 1, close), "'");
      word ??= [];
      index = close + 1;
    } else if (char === '"') {
      let cursor = index + 1;
      word ??= [];
      while (cursor < line.length && line[cursor] !== '"') {
        if (line[cursor] === "\\" && ['"', "\\", "$", "`"].includes(line[cursor + 1] ?? "")) {
          push(line[cursor + 1]!, "'");
          cursor += 2;
        } else {
          if (line[cursor] === "`" || (line[cursor] === "$" && line[cursor + 1] === "(")) throw new SyntaxError_("这里不支持命令替换（$(…) 和反引号）");
          push(line[cursor]!, '"');
          cursor += 1;
        }
      }
      if (cursor >= line.length) throw new SyntaxError_('引号没有配对：缺少结尾的 "');
      index = cursor + 1;
    } else if (char === "\\") {
      if (next !== undefined) push(next, "'");
      index += 2;
    } else if (char === "|") {
      if (next === "|") throw new SyntaxError_("这里不支持 ||，可以用 && 或分号");
      end();
      tokens.push({ kind: "op", op: "|" });
      index += 1;
    } else if (char === "&") {
      if (next === "&") {
        end();
        tokens.push({ kind: "op", op: "&&" });
        index += 2;
      } else {
        throw new SyntaxError_("这里不支持在后台运行（&）");
      }
    } else if (char === ";") {
      end();
      tokens.push({ kind: "op", op: ";" });
      index += 1;
    } else if (char === ">" || char === "<") {
      end();
      if (char === ">" && next === ">") {
        tokens.push({ kind: "op", op: ">>" });
        index += 2;
      } else {
        tokens.push({ kind: "op", op: char });
        index += 1;
      }
    } else if (char === "2" && word === null && next === ">") {
      if (line.startsWith("2>&1", index)) {
        tokens.push({ kind: "op", op: "2>&1" });
        index += 4;
      } else if (line[index + 2] === ">") {
        tokens.push({ kind: "op", op: "2>>" });
        index += 3;
      } else {
        tokens.push({ kind: "op", op: "2>" });
        index += 2;
      }
    } else if (char === "#" && word === null) {
      break;
    } else if (char === "`" || (char === "$" && next === "(")) {
      throw new SyntaxError_("这里不支持命令替换（$(…) 和反引号）");
    } else {
      push(char, "");
      index += 1;
    }
  }
  end();
  return tokens;
}

function parse(tokens: Token[]): Chain {
  const chain: Chain = [];
  let stages: Stage[] = [];
  let stage: Stage = { words: [], redirects: [] };
  const closeStage = (what: string) => {
    if (stage.words.length === 0 && stage.redirects.length === 0) throw new SyntaxError_(`语法错误：${what} 前面缺少命令`);
    stages.push(stage);
    stage = { words: [], redirects: [] };
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === "word") {
      stage.words.push(token);
    } else if (token.op === "|") {
      closeStage("|");
      if (stages.length >= LIMITS.stages) throw new SyntaxError_(`一条管道最多 ${LIMITS.stages} 段`);
    } else if (token.op === ";" || token.op === "&&") {
      closeStage(token.op);
      chain.push({ stages, then: token.op });
      stages = [];
    } else if (token.op === "2>&1") {
      stage.redirects.push({ op: "2>&1" });
    } else {
      const target = tokens[index + 1];
      if (!target || target.kind !== "word") throw new SyntaxError_(`语法错误：${token.op} 后面要跟一个文件名`);
      stage.redirects.push({ op: token.op as Redirect["op"], target });
      index += 1;
    }
  }
  if (stage.words.length > 0 || stage.redirects.length > 0) stages.push(stage);
  else if (stages.length > 0 || chain.length > 0) {
    const last = tokens[tokens.length - 1];
    if (last?.kind === "op" && last.op !== ";") throw new SyntaxError_(`语法错误：${last.op} 后面缺少命令`);
  }
  if (stages.length > 0) chain.push({ stages, then: null });
  return chain;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function expandVars(m: Machine, text: string): string {
  return text.replace(/\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|\?)/g, (_, name: string) => {
    if (name === "?") return String(m.lastCode);
    const key = name.startsWith("{") ? name.slice(1, -1) : name;
    return m.env[key] ?? "";
  });
}

function escapeGlob(text: string): string {
  return text.replace(/[*?[\\]/g, (char) => `\\${char}`);
}

/** Glob segment match with `*` and `?`, linear-time dynamic programming. */
export function globMatch(pattern: string, name: string): boolean {
  const tokens: { char: string; literal: boolean }[] = [];
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] === "\\" && index + 1 < pattern.length) {
      tokens.push({ char: pattern[index + 1]!, literal: true });
      index += 1;
    } else tokens.push({ char: pattern[index]!, literal: false });
  }
  let row = new Array<boolean>(name.length + 1).fill(false);
  row[0] = true;
  for (const token of tokens) {
    const next = new Array<boolean>(name.length + 1).fill(false);
    if (!token.literal && token.char === "*") {
      next[0] = row[0]!;
      for (let j = 1; j <= name.length; j += 1) next[j] = next[j - 1]! || row[j]!;
    } else {
      for (let j = 1; j <= name.length; j += 1) {
        next[j] = row[j - 1]! && ((!token.literal && token.char === "?") || token.char === name[j - 1]);
      }
    }
    row = next;
  }
  return row[name.length]!;
}

function hasGlob(pattern: string): boolean {
  return /(^|[^\\])[*?]/.test(pattern);
}

function expandGlob(m: Machine, pattern: string): string[] {
  const absolute = pattern.startsWith("/");
  const segments = pattern.split("/").filter(Boolean);
  let candidates: { shown: string; abs: string }[] = [{ shown: absolute ? "/" : "", abs: absolute ? "/" : m.cwd }];
  const glue = (shown: string, name: string) => (shown === "" ? name : shown.endsWith("/") ? shown + name : `${shown}/${name}`);
  for (const segment of segments) {
    if (!hasGlob(segment)) {
      const literal = segment.replace(/\\(.)/g, "$1");
      candidates = candidates.map((item) => ({ shown: glue(item.shown, literal), abs: resolve(item.abs, literal) }));
      continue;
    }
    const matched: { shown: string; abs: string }[] = [];
    for (const item of candidates) {
      if (!can(m.fs, m.user, item.abs, "r") || m.fs[item.abs]?.type !== "dir") continue;
      for (const name of childrenOf(m.fs, item.abs)) {
        if (name.startsWith(".") && !segment.startsWith(".")) continue;
        if (globMatch(segment, name)) matched.push({ shown: glue(item.shown, name), abs: join(item.abs, name) });
      }
    }
    candidates = matched.slice(0, 500);
  }
  return candidates.filter((item) => m.fs[item.abs]).map((item) => item.shown);
}

/** One word → zero or more argv entries. */
function expandWord(m: Machine, token: Token & { kind: "word" }, glob = true): string[] {
  let value = "";
  let pattern = "";
  let quoted = false;
  token.parts.forEach((part, index) => {
    let text = part.text;
    if (part.quote === "") {
      if (index === 0 && text.startsWith("~")) text = expandTilde(text, m.env.HOME ?? USERS[m.user].home);
      text = expandVars(m, text);
      value += text;
      pattern += text;
    } else {
      quoted = true;
      if (part.quote === '"') text = expandVars(m, text);
      value += text;
      pattern += escapeGlob(text);
    }
  });
  if (glob && hasGlob(pattern)) {
    const matches = expandGlob(m, pattern);
    if (matches.length > 0) return matches;
  }
  if (!quoted && value === "") return [];
  return [value];
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;

// ---------------------------------------------------------------------------
// Running a line
// ---------------------------------------------------------------------------

export function runLine(m: Machine, line: string, depth = 0): Result {
  if (line.length > LIMITS.line) return { out: "", err: `命令太长（最多 ${LIMITS.line} 个字符）\n`, code: 2 };
  let chain: Chain;
  try {
    chain = parse(tokenize(line));
  } catch (error) {
    if (error instanceof SyntaxError_) return { out: "", err: `bash: ${error.message}\n`, code: 2 };
    throw error;
  }
  let out = "";
  let err = "";
  let clear = false;
  let skip = false;
  for (const link of chain) {
    if (!skip) {
      const result = runPipeline(m, link.stages, depth);
      out += result.out;
      err += result.err;
      if (result.clear) {
        clear = true;
        out = "";
        err = "";
      }
      m.lastCode = result.code;
    }
    skip = link.then === "&&" && m.lastCode !== 0;
    if (link.then === ";") skip = false;
  }
  return { out, err, code: m.lastCode, clear };
}

function runPipeline(m: Machine, stages: Stage[], depth: number): Result {
  let input: string | null = null;
  let err = "";
  let code = 0;
  let clear = false;
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index]!;
    const last = index === stages.length - 1;
    let words = stage.words;

    const first = words[0];
    if (first && first.parts.length === 1 && first.parts[0]!.quote === "" && m.aliases[first.parts[0]!.text] && depth < LIMITS.depth) {
      try {
        const aliased = tokenize(m.aliases[first.parts[0]!.text]!).filter((token): token is Token & { kind: "word" } => token.kind === "word");
        words = [...aliased, ...words.slice(1)];
      } catch {
        // A broken alias falls through to the plain command.
      }
    }

    const assignments: [string, string][] = [];
    while (words.length > 0) {
      const head = words[0]!.parts[0];
      const match = head && head.quote === "" ? ASSIGNMENT.exec(head.text) : null;
      if (!match) break;
      const rest: Token & { kind: "word" } = { kind: "word", parts: [{ text: head!.text.slice(match[0].length), quote: "" }, ...words[0]!.parts.slice(1)] };
      assignments.push([match[1]!, expandWord(m, rest, false).join("")]);
      words = words.slice(1);
    }

    // `>` truncates before the command runs, exactly like bash: `sort f > f` empties f.
    const targets: { op: Redirect["op"]; path: string }[] = [];
    let stdin = input;
    let redirectError = "";
    for (const redirect of stage.redirects) {
      if (redirect.op === "2>&1") {
        targets.push({ op: "2>&1", path: "" });
        continue;
      }
      const expanded = expandWord(m, redirect.target!);
      if (expanded.length !== 1) {
        redirectError = `bash: ${redirect.target!.parts.map((part) => part.text).join("")}: ambiguous redirect\n`;
        break;
      }
      const path = resolve(m.cwd, expanded[0]!);
      if (redirect.op === "<") {
        const read = readFile(m, path);
        if ("error" in read) {
          redirectError = `bash: ${expanded[0]}: ${MESSAGES[read.error]}\n`;
          break;
        }
        stdin = read.text;
      } else {
        if (redirect.op === ">" || redirect.op === "2>") {
          const problem = writeFile(m, path, "", false);
          if (problem) {
            redirectError = `bash: ${expanded[0]}: ${problem === "EFBIG" ? "File too large" : MESSAGES[problem]}\n`;
            break;
          }
        } else {
          const problem = lookup(m.fs, m.user, path);
          if ("entry" in problem ? !allowed(problem.entry, m.user, "w") : problem.error !== "ENOENT") {
            redirectError = `bash: ${expanded[0]}: Permission denied\n`;
            break;
          }
        }
        targets.push({ op: redirect.op, path });
      }
    }
    if (redirectError) {
      err += redirectError;
      input = "";
      code = 1;
      continue;
    }

    let result: Result;
    if (words.length === 0) {
      for (const [name, value] of assignments) m.env[name] = value;
      result = { out: "", err: "", code: 0 };
    } else {
      const argv = words.flatMap((word) => expandWord(m, word));
      const tty = last && !targets.some((target) => target.op === ">" || target.op === ">>");
      const saved = assignments.map(([name]) => [name, m.env[name]] as const);
      for (const [name, value] of assignments) m.env[name] = value;
      result = argv.length === 0 ? { out: "", err: "", code: 0 } : execute(m, argv, stdin, tty, depth);
      for (const [name, value] of saved) {
        if (value === undefined) delete m.env[name];
        else m.env[name] = value;
      }
    }
    if (result.clear) clear = true;

    let out = result.out;
    let stageErr = result.err;
    for (const target of targets) {
      if (target.op === "2>&1") {
        out += stageErr;
        stageErr = "";
      } else if (target.op === ">" || target.op === ">>") {
        const problem = writeFile(m, target.path, out, true);
        if (problem) stageErr += `bash: write error: ${problem === "EFBIG" ? "File too large" : MESSAGES[problem]}\n`;
        out = "";
      } else if (target.op === "2>" || target.op === "2>>") {
        writeFile(m, target.path, stageErr, true);
        stageErr = "";
      }
    }
    err += stageErr;
    input = out;
    code = result.code;
  }
  return { out: input ?? "", err, code, clear };
}

// ---------------------------------------------------------------------------
// Command lookup
// ---------------------------------------------------------------------------

const BUILTINS = new Set(["cd", "pwd", "echo", "export", "alias", "unalias", "kill", "source", ".", "help", "clear", "exit", "true", "false", "type", "history"]);

const NOT_HERE: Record<string, string> = {
  less: "less 是交互式的翻页工具，这里的终端不支持。看长文件可以用 head、tail 或 grep。",
  more: "more 是交互式的翻页工具，这里的终端不支持。看长文件可以用 head、tail 或 grep。",
  vim: "这台练习机没有装编辑器。写入文件可以用 echo 加 > 或 >>。",
  vi: "这台练习机没有装编辑器。写入文件可以用 echo 加 > 或 >>。",
  nano: "这台练习机没有装编辑器。写入文件可以用 echo 加 > 或 >>。",
  man: "这台练习机没有装手册。可以输入 help 看支持哪些命令，用法见本章正文。",
  top: "top 会一直刷新屏幕，这里的终端不支持。查看进程可以用 ps aux。",
  htop: "htop 会一直刷新屏幕，这里的终端不支持。查看进程可以用 ps aux。",
  journalctl: "这里没有 journalctl。服务最近的日志可以用 systemctl status 查看。",
  ssh: "你已经登录在这台服务器上了，这里不能再连到别的机器。",
  apt: "这台练习机不能安装软件。",
  "apt-get": "这台练习机不能安装软件。",
  lsof: "这里没有 lsof。端口被谁占用可以用 ss -ltnp 查看。",
  ln: "这台练习机不支持创建链接。",
  sed: "这里没有 sed。可以用 grep 筛选、用 echo 和 >> 写入。",
  bash: "你已经在 bash 里了。",
  sh: "你已经在 bash 里了。",
};

/** Resolves a command name through PATH to an executable path, as `which` does. */
export function which(m: Machine, name: string, all = false, env = m.env): string[] {
  const found: string[] = [];
  for (const dir of (env.PATH ?? "").split(":")) {
    const base = dir === "" ? m.cwd : resolve(m.cwd, dir);
    const path = join(base, name);
    const entry = m.fs[path];
    if (entry?.type === "file" && can(m.fs, m.user, path, "x")) {
      found.push(dir === "" || !dir.startsWith("/") ? path : join(dir, name));
      if (!all) break;
    }
  }
  return found;
}

function execute(m: Machine, argv: string[], stdin: string | null, tty: boolean, depth: number): Result {
  const [name, ...args] = argv as [string, ...string[]];
  if (BUILTINS.has(name)) return builtin(m, name, args, stdin, depth);
  if (NOT_HERE[name]) return { out: "", err: `${NOT_HERE[name]}\n`, code: 127 };
  let path: string;
  if (name.includes("/")) {
    path = resolve(m.cwd, name);
    const found = lookup(m.fs, m.user, path);
    if ("error" in found) return { out: "", err: `bash: ${name}: ${MESSAGES[found.error]}\n`, code: 127 };
    if (found.entry.type === "dir") return { out: "", err: `bash: ${name}: Is a directory\n`, code: 126 };
    if (!allowed(found.entry, m.user, "x")) return { out: "", err: `bash: ${name}: Permission denied\n`, code: 126 };
  } else {
    const hit = which(m, name)[0];
    if (!hit) return { out: "", err: `bash: ${name}: command not found\n`, code: 127 };
    path = resolve(m.cwd, hit);
  }
  const program = m.fs[path]?.program;
  if (!program) return { out: "", err: `bash: ${name}: 这个文件不是这台练习机能运行的程序\n`, code: 126 };
  const custom = m.hooks.program?.(m, program, args);
  if (custom) return custom;
  const run = PROGRAMS[program];
  if (!run) return { out: "", err: `bash: ${name}: command not found\n`, code: 127 };
  return run({ m, args, stdin, tty, name, depth });
}

type Ctx = { m: Machine; args: string[]; stdin: string | null; tty: boolean; name: string; depth: number };
const ok = (out = ""): Result => ({ out, err: "", code: 0 });
const error = (err: string, code = 1): Result => ({ out: "", err: err.endsWith("\n") ? err : `${err}\n`, code });

function lines(text: string): string[] {
  if (text === "") return [];
  const all = text.split("\n");
  if (all[all.length - 1] === "") all.pop();
  return all;
}

const text = (rows: string[]) => (rows.length === 0 ? "" : `${rows.join("\n")}\n`);

/** Splits short options (`-la`, `-n 5`, `-n5`) from operands. */
function options(args: string[], withValue: string = "", numericShort = false) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  let bad: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--") {
      rest.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const [key, value] = arg.split("=", 2) as [string, string | undefined];
      flags.add(key);
      if (value !== undefined) values[key] = value;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      if (numericShort && /^-\d+$/.test(arg)) {
        values.n = arg.slice(1);
        continue;
      }
      for (let cursor = 1; cursor < arg.length; cursor += 1) {
        const flag = arg[cursor]!;
        if (withValue.includes(flag)) {
          const value = arg.slice(cursor + 1) || args[++index];
          if (value === undefined) bad = `option requires an argument -- '${flag}'`;
          else values[flag] = value;
          break;
        }
        flags.add(flag);
      }
      continue;
    }
    rest.push(arg);
  }
  return { flags, values, rest, bad };
}

/** Reads every operand (or stdin) for filters such as cat, grep, sort. */
function inputs(ctx: Ctx, files: string[]): { chunks: { name: string; text: string }[]; err: string; missingInput: boolean } {
  if (files.length === 0) {
    if (ctx.stdin === null) return { chunks: [], err: "", missingInput: true };
    return { chunks: [{ name: "(standard input)", text: ctx.stdin }], err: "", missingInput: false };
  }
  const chunks: { name: string; text: string }[] = [];
  let err = "";
  for (const file of files) {
    if (file === "-") {
      chunks.push({ name: "(standard input)", text: ctx.stdin ?? "" });
      continue;
    }
    const read = readFile(ctx.m, resolve(ctx.m.cwd, file));
    if ("error" in read) err += `${ctx.name}: ${file}: ${MESSAGES[read.error]}\n`;
    else chunks.push({ name: file, text: read.text });
  }
  return { chunks, err, missingInput: false };
}

const NO_INPUT = (name: string) => error(`${name}：这里没有键盘输入。请给出文件名，或者用管道把内容传进来，例如 cat 文件 | ${name}`);

// ---------------------------------------------------------------------------
// Builtins
// ---------------------------------------------------------------------------

const SIGNALS: Record<string, Signal> = { "9": "KILL", KILL: "KILL", SIGKILL: "KILL", "15": "TERM", TERM: "TERM", SIGTERM: "TERM", "1": "HUP", HUP: "HUP", SIGHUP: "HUP", "2": "INT", INT: "INT", SIGINT: "INT" };

function builtin(m: Machine, name: string, args: string[], stdin: string | null, depth: number): Result {
  switch (name) {
    case "true":
      return ok();
    case "false":
      return { out: "", err: "", code: 1 };
    case "pwd":
      return ok(`${m.cwd}\n`);
    case "cd": {
      const target = args[0] === undefined ? (m.env.HOME ?? USERS[m.user].home) : args[0] === "-" ? m.oldCwd : args[0];
      if (args.length > 1) return error("bash: cd: too many arguments");
      const abs = resolve(m.cwd, target);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) return error(`bash: cd: ${target}: ${MESSAGES[found.error]}`);
      if (found.entry.type !== "dir") return error(`bash: cd: ${target}: Not a directory`);
      if (!allowed(found.entry, m.user, "x")) return error(`bash: cd: ${target}: Permission denied`);
      m.oldCwd = m.cwd;
      m.cwd = abs;
      m.env.PWD = abs;
      return args[0] === "-" ? ok(`${abs}\n`) : ok();
    }
    case "echo": {
      const newline = args[0] !== "-n";
      const words = newline ? args.filter((arg, index) => !(index === 0 && arg === "-e")) : args.slice(1);
      return ok(words.join(" ") + (newline ? "\n" : ""));
    }
    case "export": {
      if (args.length === 0 || args[0] === "-p") {
        return ok(text(Object.keys(m.env).sort().map((key) => `declare -x ${key}="${m.env[key]}"`)));
      }
      for (const arg of args) {
        const match = ASSIGNMENT.exec(arg);
        if (match) m.env[match[1]!] = arg.slice(match[0].length);
        else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) return error(`bash: export: \`${arg}': not a valid identifier`);
        else m.env[arg] ??= "";
      }
      return ok();
    }
    case "alias": {
      if (args.length === 0) return ok(text(Object.keys(m.aliases).sort().map((key) => `alias ${key}='${m.aliases[key]}'`)));
      for (const arg of args) {
        const equal = arg.indexOf("=");
        if (equal <= 0) {
          if (!m.aliases[arg]) return error(`bash: alias: ${arg}: not found`);
          return ok(`alias ${arg}='${m.aliases[arg]}'\n`);
        }
        m.aliases[arg.slice(0, equal)] = arg.slice(equal + 1);
      }
      return ok();
    }
    case "unalias":
      for (const arg of args) delete m.aliases[arg];
      return ok();
    case "type": {
      const rows: string[] = [];
      for (const arg of args) {
        if (m.aliases[arg]) rows.push(`${arg} is aliased to \`${m.aliases[arg]}'`);
        else if (BUILTINS.has(arg)) rows.push(`${arg} is a shell builtin`);
        else {
          const hit = which(m, arg)[0];
          if (!hit) return { out: text(rows), err: `bash: type: ${arg}: not found\n`, code: 1 };
          rows.push(`${arg} is ${hit}`);
        }
      }
      return ok(text(rows));
    }
    case "kill":
      return kill(m, args);
    case "source":
    case ".": {
      if (!args[0]) return error(`bash: ${name}: filename argument required`);
      if (depth >= LIMITS.depth) return error(`bash: ${name}: 嵌套太深`);
      const read = readFile(m, resolve(m.cwd, expandTilde(args[0], m.env.HOME ?? USERS[m.user].home)));
      if ("error" in read) return error(`bash: ${args[0]}: ${MESSAGES[read.error]}`);
      let out = "";
      let err = "";
      for (const row of lines(read.text).slice(0, 50)) {
        const result = runLine(m, row, depth + 1);
        out += result.out;
        err += result.err;
      }
      return { out, err, code: 0 };
    }
    case "help":
      return ok(HELP);
    case "clear":
      return { out: "", err: "", code: 0, clear: true };
    case "history":
      return error("history：这里看不到历史记录。上面的终端输出就是你运行过的命令。");
    case "exit":
      return error("这里的练习终端不能退出。");
    default:
      return stdin === null ? error(`bash: ${name}: command not found`, 127) : ok();
  }
}

const HELP = `这台练习机支持的命令：
  查看位置    pwd  cd  ls [-l -a -h]
  文件        cat  head  tail  touch  mkdir [-p]  cp [-r]  mv  rm [-r -f]  rmdir  truncate
  查找与统计  grep [-i -v -c -n]  wc [-l]  sort [-n -r -u]  uniq [-c]  cut  awk '{print $1}'  find  du  df
  权限与用户  chmod  whoami  id
  进程与服务  ps [aux]  kill  ss -ltnp  systemctl  curl
  环境        echo  env  printenv  export  which  type  alias  source
组合：|  >  >>  2>  2>&1  <  &&  ;   通配符：*  ?
`;

function kill(m: Machine, args: string[]): Result {
  let signal: Signal = "TERM";
  const pids: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "-l") return ok(" 1) SIGHUP   2) SIGINT   9) SIGKILL  15) SIGTERM\n");
    if (arg === "-s") {
      const value = (args[++index] ?? "").toUpperCase();
      if (!SIGNALS[value]) return error(`bash: kill: ${value}: invalid signal specification`);
      signal = SIGNALS[value]!;
    } else if (arg.startsWith("-")) {
      const value = arg.slice(1).toUpperCase();
      if (!SIGNALS[value]) return error(`bash: kill: ${arg.slice(1)}: invalid signal specification`);
      signal = SIGNALS[value]!;
    } else pids.push(arg);
  }
  if (pids.length === 0) return error("kill: usage: kill [-s sigspec | -signum] pid ...", 2);
  let err = "";
  for (const raw of pids) {
    if (!/^\d+$/.test(raw)) {
      err += `bash: kill: ${raw}: arguments must be process or job IDs\n`;
      continue;
    }
    const proc = m.procs.find((item) => item.pid === Number(raw));
    if (!proc) {
      err += `bash: kill: (${raw}) - No such process\n`;
      continue;
    }
    if (proc.user !== m.user && m.user !== "root") {
      err += `bash: kill: (${raw}) - Operation not permitted\n`;
      continue;
    }
    m.events.push(`kill:${proc.pid}:${signal}`);
    const handled = m.hooks.signal?.(m, proc, signal) ?? true;
    if (handled) endProcess(m, proc.pid);
  }
  return { out: "", err, code: err ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

function longRow(entry: Entry, name: string, h: boolean, width: { owner: number; group: number; size: number }) {
  const size = h ? human(sizeOf(entry)) : String(sizeOf(entry));
  return `${modeString(entry)} ${entry.type === "dir" ? 2 : 1} ${entry.owner.padEnd(width.owner)} ${entry.group.padEnd(width.group)} ${size.padStart(width.size)} ${entry.time} ${name}`;
}

function listing(m: Machine, rows: { name: string; entry: Entry }[], long: boolean, h: boolean, tty: boolean): string[] {
  if (!long) return tty ? (rows.length ? [rows.map((row) => row.name).join("  ")] : []) : rows.map((row) => row.name);
  const width = {
    owner: Math.max(...rows.map((row) => row.entry.owner.length), 1),
    group: Math.max(...rows.map((row) => row.entry.group.length), 1),
    size: Math.max(...rows.map((row) => (h ? human(sizeOf(row.entry)) : String(sizeOf(row.entry))).length), 1),
  };
  return rows.map((row) => longRow(row.entry, row.name, h, width));
}

const PROGRAMS: Record<string, (ctx: Ctx) => Result> = {
  ls(ctx) {
    const { m } = ctx;
    const { flags, rest } = options(ctx.args);
    const all = flags.has("a");
    const long = flags.has("l");
    const h = flags.has("h");
    const one = flags.has("1");
    const tty = ctx.tty && !one;
    const targets = rest.length ? rest : ["."];
    const out: string[] = [];
    let err = "";
    const files: { name: string; entry: Entry }[] = [];
    const dirs: { name: string; abs: string }[] = [];
    for (const target of targets) {
      const abs = resolve(m.cwd, target);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) err += `ls: cannot access '${target}': ${MESSAGES[found.error]}\n`;
      else if (found.entry.type === "file" || flags.has("d")) files.push({ name: target, entry: found.entry });
      else dirs.push({ name: target, abs });
    }
    if (files.length) out.push(...listing(m, files, long, h, tty));
    dirs.forEach((dir, index) => {
      const entry = m.fs[dir.abs]!;
      if (!allowed(entry, m.user, "r")) {
        err += `ls: cannot open directory '${dir.name}': Permission denied\n`;
        return;
      }
      if (targets.length > 1) {
        if (out.length || index > 0) out.push("");
        out.push(`${dir.name}:`);
      }
      const names = childrenOf(m.fs, dir.abs).filter((name) => all || !name.startsWith("."));
      const rows = names.map((name) => ({ name, entry: m.fs[join(dir.abs, name)]! }));
      if (all) rows.unshift({ name: ".", entry }, { name: "..", entry: m.fs[parentOf(dir.abs)]! });
      if (long) {
        const blocks = rows.reduce((sum, row) => sum + Math.ceil(sizeOf(row.entry) / 4096) * 4, 0);
        out.push(`total ${h ? human(blocks * 1024) : blocks}`);
      }
      out.push(...listing(m, rows, long, h, tty));
    });
    return { out: text(out), err, code: err ? 2 : 0 };
  },

  cat(ctx) {
    const { flags, rest } = options(ctx.args);
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("cat");
    let body = read.chunks.map((chunk) => chunk.text).join("");
    if (flags.has("n")) body = text(lines(body).map((row, index) => `${String(index + 1).padStart(6)}\t${row}`));
    return { out: body, err: read.err, code: read.err ? 1 : 0 };
  },

  head(ctx) {
    return headTail(ctx, "head");
  },

  tail(ctx) {
    return headTail(ctx, "tail");
  },

  grep(ctx) {
    const { flags, values, rest, bad } = options(ctx.args, "e");
    if (bad) return error(`grep: ${bad}`, 2);
    const pattern = values.e ?? rest.shift();
    if (pattern === undefined) return error("Usage: grep [OPTION]... PATTERN [FILE]...", 2);
    if (flags.has("r") || flags.has("R")) return error("grep：这里不支持 -r。可以先用 find 找到文件，再对文件 grep。", 2);
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("grep");
    const match = matcher(pattern, flags.has("i"));
    const invert = flags.has("v");
    const many = read.chunks.length > 1;
    const out: string[] = [];
    let hits = 0;
    for (const chunk of read.chunks) {
      let count = 0;
      lines(chunk.text).forEach((row, index) => {
        if (match(row) === invert) return;
        count += 1;
        if (!flags.has("c")) out.push(`${many ? `${chunk.name}:` : ""}${flags.has("n") ? `${index + 1}:` : ""}${row}`);
      });
      if (flags.has("c")) out.push(`${many ? `${chunk.name}:` : ""}${count}`);
      hits += count;
    }
    return { out: text(out), err: read.err, code: read.err ? 2 : hits > 0 ? 0 : 1 };
  },

  wc(ctx) {
    const { flags, rest } = options(ctx.args);
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("wc");
    const pick = flags.size === 0 ? ["l", "w", "c"] : ["l", "w", "c"].filter((flag) => flags.has(flag) || (flag === "c" && flags.has("m")));
    const rows = read.chunks.map((chunk) => ({
      name: chunk.name === "(standard input)" ? "" : chunk.name,
      l: lines(chunk.text).length,
      w: chunk.text.split(/\s+/).filter(Boolean).length,
      c: byteLength(chunk.text),
    }));
    if (rows.length > 1) rows.push({ name: "total", l: sum(rows, "l"), w: sum(rows, "w"), c: sum(rows, "c") });
    const single = rows.length === 1 && pick.length === 1;
    const width = single ? 0 : Math.max(...rows.flatMap((row) => pick.map((key) => String(row[key as "l"]).length)), 1);
    return {
      out: text(rows.map((row) => [...pick.map((key) => String(row[key as "l"]).padStart(width)), row.name].filter(Boolean).join(" "))),
      err: read.err,
      code: read.err ? 1 : 0,
    };
  },

  sort(ctx) {
    const { flags, rest } = options(ctx.args);
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("sort");
    const all = read.chunks.flatMap((chunk) => lines(chunk.text));
    const numeric = (row: string) => {
      const match = /^\s*(-?\d+(\.\d+)?)/.exec(row);
      return match ? Number(match[1]) : 0;
    };
    const plain = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const compare = flags.has("n") ? (a: string, b: string) => numeric(a) - numeric(b) || plain(a, b) : plain;
    let sorted = [...all].sort(compare);
    if (flags.has("r")) sorted.reverse();
    if (flags.has("u")) sorted = sorted.filter((row, index) => index === 0 || compare(row, sorted[index - 1]!) !== 0);
    return { out: text(sorted), err: read.err, code: read.err ? 2 : 0 };
  },

  uniq(ctx) {
    const { flags, rest } = options(ctx.args);
    const read = inputs(ctx, rest.slice(0, 1));
    if (read.missingInput) return NO_INPUT("uniq");
    const groups: { row: string; count: number }[] = [];
    for (const row of lines(read.chunks[0]?.text ?? "")) {
      const last = groups[groups.length - 1];
      if (last && last.row === row) last.count += 1;
      else groups.push({ row, count: 1 });
    }
    const kept = flags.has("d") ? groups.filter((group) => group.count > 1) : groups;
    return { out: text(kept.map((group) => (flags.has("c") ? `${String(group.count).padStart(7)} ${group.row}` : group.row))), err: read.err, code: read.err ? 1 : 0 };
  },

  cut(ctx) {
    const { values, rest, bad } = options(ctx.args, "dfc");
    if (bad) return error(`cut: ${bad}`);
    const list = values.f ?? values.c;
    if (!list) return error("cut: you must specify a list of bytes, characters, or fields");
    const picks = parseList(list);
    if (!picks) return error(`cut: invalid field value '${list}'`);
    const delimiter = values.d ?? "\t";
    if (values.f && delimiter.length !== 1) return error("cut: the delimiter must be a single character");
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("cut");
    const out = read.chunks.flatMap((chunk) =>
      lines(chunk.text).map((row) => {
        if (values.c) return [...row].filter((_, index) => picks(index + 1)).join("");
        const fields = row.split(delimiter);
        if (fields.length === 1) return row;
        return fields.filter((_, index) => picks(index + 1)).join(delimiter);
      }),
    );
    return { out: text(out), err: read.err, code: read.err ? 1 : 0 };
  },

  awk(ctx) {
    const { values, rest, bad } = options(ctx.args, "F");
    if (bad) return error(`awk: ${bad}`, 2);
    const program = rest.shift();
    const match = program ? /^\s*\{\s*print\s+((?:\$\d+\s*,?\s*)+)\s*\}\s*$/.exec(program) : null;
    if (!match) return error("awk：这里的 awk 只支持取列，例如 awk '{print $1}' 或 awk -F: '{print $1, $3}'", 2);
    const columns = [...match[1]!.matchAll(/\$(\d+)/g)].map((item) => Number(item[1]));
    const read = inputs(ctx, rest);
    if (read.missingInput) return NO_INPUT("awk");
    const separator = values.F;
    const out = read.chunks.flatMap((chunk) =>
      lines(chunk.text).map((row) => {
        const fields = separator ? row.split(separator) : row.trim().split(/\s+/);
        return columns.map((column) => (column === 0 ? row : (fields[column - 1] ?? ""))).join(" ");
      }),
    );
    return { out: text(out), err: read.err, code: read.err ? 2 : 0 };
  },

  touch(ctx) {
    const { m } = ctx;
    const { rest } = options(ctx.args);
    if (!rest.length) return error("touch: missing file operand");
    let err = "";
    for (const target of rest) {
      const abs = resolve(m.cwd, target);
      if (m.fs[abs] && can(m.fs, m.user, abs, "w")) m.fs[abs] = { ...m.fs[abs]!, time: m.clock };
      else {
        const problem = writeFile(m, abs, "", true);
        if (problem) err += `touch: cannot touch '${target}': ${problem === "EFBIG" ? "File too large" : MESSAGES[problem]}\n`;
      }
    }
    return { out: "", err, code: err ? 1 : 0 };
  },

  mkdir(ctx) {
    const { m } = ctx;
    const { flags, rest } = options(ctx.args);
    if (!rest.length) return error("mkdir: missing operand");
    let err = "";
    for (const target of rest) {
      const abs = resolve(m.cwd, target);
      const chain = flags.has("p") ? ancestorsOf(abs) : [abs];
      for (const path of chain) {
        if (m.fs[path]) {
          if (path === abs && !flags.has("p")) err += `mkdir: cannot create directory '${target}': File exists\n`;
          else if (m.fs[path]!.type !== "dir") err += `mkdir: cannot create directory '${target}': Not a directory\n`;
          continue;
        }
        const problem = canModifyDir(m, parentOf(path));
        if (problem) {
          err += `mkdir: cannot create directory '${target}': ${MESSAGES[problem]}\n`;
          break;
        }
        m.fs[path] = { type: "dir", owner: m.user, group: USERS[m.user].groups[0]!, mode: 0o755, content: "", time: m.clock };
      }
    }
    return { out: "", err, code: err ? 1 : 0 };
  },

  rmdir(ctx) {
    const { m } = ctx;
    let err = "";
    for (const target of options(ctx.args).rest) {
      const abs = resolve(m.cwd, target);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) err += `rmdir: failed to remove '${target}': ${MESSAGES[found.error]}\n`;
      else if (found.entry.type !== "dir") err += `rmdir: failed to remove '${target}': Not a directory\n`;
      else if (childrenOf(m.fs, abs).length > 0) err += `rmdir: failed to remove '${target}': Directory not empty\n`;
      else {
        const problem = canModifyDir(m, parentOf(abs));
        if (problem) err += `rmdir: failed to remove '${target}': ${MESSAGES[problem]}\n`;
        else delete m.fs[abs];
      }
    }
    return { out: "", err, code: err ? 1 : 0 };
  },

  rm(ctx) {
    const { m } = ctx;
    const { flags, rest } = options(ctx.args);
    const recursive = flags.has("r") || flags.has("R") || flags.has("--recursive");
    const force = flags.has("f") || flags.has("--force");
    if (!rest.length) return force ? ok() : error("rm: missing operand");
    let err = "";
    const out: string[] = [];
    for (const target of rest) {
      const abs = resolve(m.cwd, target);
      if (abs === "/" || ["/bin", "/usr", "/etc", "/home", "/srv", "/var"].includes(abs)) {
        err += `rm: refusing to remove '${target}'（练习机保护了系统目录）\n`;
        continue;
      }
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) {
        if (!force || found.error !== "ENOENT") err += `rm: cannot remove '${target}': ${MESSAGES[found.error]}\n`;
        continue;
      }
      if (found.entry.type === "dir" && !recursive) {
        err += `rm: cannot remove '${target}': Is a directory\n`;
        continue;
      }
      const problem = canModifyDir(m, parentOf(abs));
      if (problem) {
        err += `rm: cannot remove '${target}': ${MESSAGES[problem]}\n`;
        continue;
      }
      const blocked = found.entry.type === "dir" ? descendants(m.fs, abs).find((key) => m.fs[key]!.type === "dir" && !(allowed(m.fs[key]!, m.user, "w") && allowed(m.fs[key]!, m.user, "x"))) : undefined;
      if (blocked) {
        err += `rm: cannot remove '${target}': Permission denied\n`;
        continue;
      }
      removePath(m, abs);
      if (flags.has("v")) out.push(`removed '${target}'`);
    }
    return { out: text(out), err, code: err ? 1 : 0 };
  },

  cp(ctx) {
    return copyOrMove(ctx, "cp");
  },

  mv(ctx) {
    return copyOrMove(ctx, "mv");
  },

  chmod(ctx) {
    const { m } = ctx;
    const [spec, ...targets] = ctx.args.filter((arg) => arg !== "-v");
    if (!spec || targets.length === 0) return error("chmod: missing operand");
    let err = "";
    for (const target of targets) {
      const abs = resolve(m.cwd, target);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) {
        err += `chmod: cannot access '${target}': ${MESSAGES[found.error]}\n`;
        continue;
      }
      if (found.entry.owner !== m.user && m.user !== "root") {
        err += `chmod: changing permissions of '${target}': Operation not permitted\n`;
        continue;
      }
      const mode = applyMode(found.entry.mode, spec);
      if (mode === null) return error(`chmod: invalid mode: '${spec}'`);
      m.fs[abs] = { ...found.entry, mode };
    }
    return { out: "", err, code: err ? 1 : 0 };
  },

  truncate(ctx) {
    const { m } = ctx;
    const { values, rest, bad } = options(ctx.args, "s");
    if (bad || values.s === undefined) return error("truncate: you must specify '-s 0'（这里只支持把文件清空：truncate -s 0 文件）");
    if (values.s !== "0") return error("truncate：这里只支持 -s 0，也就是把文件清空。");
    let err = "";
    for (const target of rest) {
      const abs = resolve(m.cwd, target);
      const problem = writeFile(m, abs, "", false);
      if (problem) err += `truncate: cannot open '${target}' for writing: ${problem === "EFBIG" ? "File too large" : MESSAGES[problem]}\n`;
      else m.fs[abs] = { ...m.fs[abs]!, size: undefined };
    }
    return { out: "", err, code: err ? 1 : 0 };
  },

  find(ctx) {
    const { m } = ctx;
    const starts: string[] = [];
    let index = 0;
    while (index < ctx.args.length && !ctx.args[index]!.startsWith("-")) starts.push(ctx.args[index++]!);
    if (starts.length === 0) starts.push(".");
    const tests: ((path: string, entry: Entry) => boolean)[] = [];
    let maxDepth = Infinity;
    while (index < ctx.args.length) {
      const flag = ctx.args[index]!;
      const value = ctx.args[index + 1];
      if (value === undefined) return error(`find: missing argument to \`${flag}'`);
      index += 2;
      if (flag === "-name" || flag === "-iname") {
        const pattern = flag === "-iname" ? value.toLowerCase() : value;
        tests.push((path) => globMatch(pattern, flag === "-iname" ? baseName(path).toLowerCase() : baseName(path)));
      } else if (flag === "-type") {
        if (value !== "f" && value !== "d") return error(`find: Unknown argument to -type: ${value}`);
        tests.push((_, entry) => (value === "f" ? entry.type === "file" : entry.type === "dir"));
      } else if (flag === "-size") {
        const match = /^([+-]?)(\d+)([ckMG]?)$/.exec(value);
        if (!match) return error(`find: invalid -size argument \`${value}'`);
        const unit = { "": 512, c: 1, k: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[3] as "" | "c" | "k" | "M" | "G"];
        const limit = Number(match[2]) * unit;
        tests.push((_, entry) => {
          if (entry.type !== "file") return false;
          const size = sizeOf(entry);
          return match[1] === "+" ? size > limit : match[1] === "-" ? size < limit : Math.ceil(size / unit) === Number(match[2]);
        });
      } else if (flag === "-user") {
        tests.push((_, entry) => entry.owner === value);
      } else if (flag === "-maxdepth") {
        if (!/^\d+$/.test(value)) return error(`find: Expected a positive decimal integer argument to -maxdepth, but got '${value}'`);
        maxDepth = Number(value);
      } else {
        return error(`find：这里不支持 ${flag}。可以用 -name、-type、-size、-user、-maxdepth`);
      }
    }
    const out: string[] = [];
    let err = "";
    const visit = (abs: string, shown: string, depth: number) => {
      const entry = m.fs[abs]!;
      if (tests.every((test) => test(abs, entry))) out.push(shown);
      if (entry.type !== "dir" || depth >= maxDepth) return;
      if (!allowed(entry, m.user, "r") || !allowed(entry, m.user, "x")) {
        err += `find: '${shown}': Permission denied\n`;
        return;
      }
      for (const name of childrenOf(m.fs, abs)) visit(join(abs, name), shown.endsWith("/") ? shown + name : `${shown}/${name}`, depth + 1);
    };
    for (const start of starts) {
      const abs = resolve(m.cwd, start);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) err += `find: '${start}': ${MESSAGES[found.error]}\n`;
      else visit(abs, start, 0);
    }
    return { out: text(out.slice(0, 2000)), err, code: err ? 1 : 0 };
  },

  du(ctx) {
    const { m } = ctx;
    const { flags, values, rest } = options(ctx.args, "d");
    const summary = flags.has("s");
    const h = flags.has("h");
    const maxDepth = values.d !== undefined ? Number(values.d) : values["--max-depth"] !== undefined ? Number(values["--max-depth"]) : summary ? 0 : Infinity;
    const out: string[] = [];
    let err = "";
    const fmt = (blocks: number) => (h ? human(blocks * 1024) : String(blocks));
    const usage = (abs: string, shown: string, depth: number): number => {
      const entry = m.fs[abs]!;
      if (entry.type === "file") {
        const blocks = Math.ceil(sizeOf(entry) / 4096) * 4;
        if (flags.has("a") && depth <= maxDepth) out.push(`${fmt(blocks)}\t${shown}`);
        return blocks;
      }
      let total = 4;
      if (!allowed(entry, m.user, "r") || !allowed(entry, m.user, "x")) {
        err += `du: cannot read directory '${shown}': Permission denied\n`;
      } else {
        for (const name of childrenOf(m.fs, abs)) total += usage(join(abs, name), shown.endsWith("/") ? shown + name : `${shown}/${name}`, depth + 1);
      }
      if (depth <= maxDepth) out.push(`${fmt(total)}\t${shown}`);
      return total;
    };
    for (const target of rest.length ? rest : ["."]) {
      const abs = resolve(m.cwd, target);
      const found = lookup(m.fs, m.user, abs);
      if ("error" in found) err += `du: cannot access '${target}': ${MESSAGES[found.error]}\n`;
      else if (found.entry.type === "file") {
        out.push(`${fmt(Math.ceil(sizeOf(found.entry) / 4096) * 4)}\t${target}`);
      } else usage(abs, target, 0);
    }
    return { out: text(out), err, code: err ? 1 : 0 };
  },

  df(ctx) {
    const { m } = ctx;
    const h = options(ctx.args).flags.has("h");
    const used = diskUsed(m);
    const free = m.disk.total - used;
    const fmt = (bytes: number) => (h ? human(bytes) : String(Math.round(bytes / 1024)));
    const rows = [
      ["Filesystem", h ? "Size" : "1K-blocks", "Used", "Avail", "Use%", "Mounted on"],
      ["/dev/vda1", fmt(m.disk.total), fmt(used), fmt(free), `${diskPercent(m)}%`, "/"],
      ["tmpfs", fmt(512 * 1024 ** 2), "0", fmt(512 * 1024 ** 2), "0%", "/dev/shm"],
    ];
    const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
    return ok(text(rows.map((row) => row.map((cell, column) => (column === 0 || column === 5 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join("  ").trimEnd())));
  },

  ps(ctx) {
    const { m } = ctx;
    const full = ctx.args.some((arg) => /a|e/.test(arg.replace(/^-/, "")));
    if (!full) return ok(`    PID TTY          TIME CMD\n   2201 pts/0    00:00:00 bash\n   ${String(m.nextPid).padStart(4)} pts/0    00:00:00 ps\n`);
    const rows = [
      ["USER", "PID", "%CPU", "%MEM", "START", "COMMAND"],
      ...[...m.procs].sort((a, b) => a.pid - b.pid).map((proc) => [proc.user, String(proc.pid), proc.cpu, proc.mem, proc.start, proc.command]),
      [m.user, "2201", "0.0", "0.1", "07:50", "-bash"],
      [m.user, String(m.nextPid), "0.0", "0.0", m.clock.slice(-5), `ps ${ctx.args.join(" ")}`.trim()],
    ];
    const widths = [9, 6, 5, 5, 6];
    return ok(text(rows.map((row) => row.map((cell, column) => (column === 5 ? cell : column === 0 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join(" "))));
  },

  ss(ctx) {
    const { m } = ctx;
    const flags = new Set(ctx.args.join("").replace(/-/g, "").split(""));
    if (!flags.has("l") || !flags.has("t")) return error("ss：这里只支持查看正在监听的 TCP 端口：ss -ltn 或 ss -ltnp");
    const names: Record<number, string> = { 22: "ssh", 80: "http", 443: "https", 5432: "postgresql" };
    const rows = [["State", "Local Address:Port", "Process"]];
    for (const proc of [...m.procs].filter((item) => item.port).sort((a, b) => a.port! - b.port!)) {
      const port = flags.has("n") ? String(proc.port) : (names[proc.port!] ?? String(proc.port));
      const local = proc.port === 5432 ? `127.0.0.1:${port}` : `0.0.0.0:${port}`;
      const process = flags.has("p") && (proc.user === m.user || m.user === "root") ? `users:(("${proc.name}",pid=${proc.pid},fd=6))` : "";
      rows.push(["LISTEN", local, process]);
    }
    return ok(text(rows.map((row) => `${row[0]!.padEnd(8)}${row[1]!.padEnd(22)}${row[2]}`.trimEnd())));
  },

  systemctl(ctx) {
    return systemctl(ctx.m, ctx.args, ctx.m.user === "root");
  },

  sudo(ctx) {
    const { m, args } = ctx;
    if (args[0] === "systemctl") return systemctl(m, args.slice(1), true);
    if (args.length === 0) return error("usage: sudo command");
    return error(`Sorry, user ${m.user} is not allowed to execute '${args.join(" ")}' as root on ${m.hostname}.\n（这台机器只允许 ${m.user} 用 sudo 运行 systemctl）`);
  },

  curl(ctx) {
    const { m } = ctx;
    const { flags, rest } = options(ctx.args);
    const url = rest[0];
    if (!url) return error("curl: try 'curl --help' for more information", 2);
    const match = /^(?:https?:\/\/)?(localhost|127\.0\.0\.1|library\.test)(?::(\d+))?(\/[^\s]*)?$/.exec(url);
    if (!match) return error(`curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, "").split("/")[0]}（练习机只能访问本机）`, 6);
    const port = Number(match[2] ?? (url.startsWith("https") ? 443 : 80));
    const listening = m.procs.some((proc) => proc.port === port);
    if (!listening) return error(`curl: (7) Failed to connect to ${match[1]} port ${port} after 0 ms: Couldn't connect to server`, 7);
    const response = m.hooks.curl?.(m, match[3] ?? "/") ?? { status: 200, headers: ["Content-Type: text/html"], body: "<h1>library.test</h1>\n" };
    const reason: Record<number, string> = { 200: "OK", 404: "Not Found", 500: "Internal Server Error", 503: "Service Unavailable" };
    const head = [`HTTP/1.1 ${response.status} ${reason[response.status] ?? ""}`.trim(), ...response.headers];
    if (flags.has("I")) return ok(text(head));
    if (flags.has("i")) return ok(`${text(head)}\n${response.body}`);
    return ok(response.body);
  },

  which(ctx) {
    const { flags, rest } = options(ctx.args);
    const rows = rest.flatMap((name) => which(ctx.m, name, flags.has("a")));
    const missing = rest.some((name) => which(ctx.m, name).length === 0);
    return { out: text(rows), err: "", code: missing ? 1 : 0 };
  },

  env(ctx) {
    return ok(text(Object.keys(ctx.m.env).sort().map((key) => `${key}=${ctx.m.env[key]}`)));
  },

  printenv(ctx) {
    if (ctx.args.length === 0) return PROGRAMS.env!(ctx);
    const values = ctx.args.map((key) => ctx.m.env[key]).filter((value): value is string => value !== undefined);
    return { out: text(values), err: "", code: values.length === ctx.args.length ? 0 : 1 };
  },

  whoami(ctx) {
    return ok(`${ctx.m.user}\n`);
  },

  id(ctx) {
    const name = ctx.args[0] ?? ctx.m.user;
    if (!isUser(name)) return error(`id: '${name}': no such user`);
    const info = USERS[name];
    const primary = info.groups[0]!;
    return ok(`uid=${info.uid}(${name}) gid=${GIDS[primary]}(${primary}) groups=${info.groups.map((group) => `${GIDS[group]}(${group})`).join(",")}\n`);
  },

  hostname(ctx) {
    return ok(`${ctx.m.hostname}\n`);
  },

  date(ctx) {
    return ok(`Tue Oct 27 ${ctx.m.clock.slice(-5)}:00 CST 2026\n`);
  },

  git(ctx) {
    return ctx.args[0] === "--version" ? ok("git version 2.43.0\n") : error("git：这门课只用到 git --version。Git 的用法在路线的下一门课里。");
  },
};

function sum<T extends Record<string, unknown>>(rows: T[], key: keyof T): number {
  return rows.reduce((total, row) => total + (row[key] as number), 0);
}

function ancestorsOf(abs: string): string[] {
  const parts = abs.split("/").filter(Boolean);
  return parts.map((_, index) => `/${parts.slice(0, index + 1).join("/")}`);
}

function parseList(list: string): ((position: number) => boolean) | null {
  const ranges: [number, number][] = [];
  for (const piece of list.split(",")) {
    const match = /^(\d*)(-?)(\d*)$/.exec(piece);
    if (!match || (match[1] === "" && match[3] === "")) return null;
    const start = match[1] ? Number(match[1]) : 1;
    const end = match[2] ? (match[3] ? Number(match[3]) : Infinity) : start;
    if (start < 1 || end < start) return null;
    ranges.push([start, end]);
  }
  return (position) => ranges.some(([start, end]) => position >= start && position <= end);
}

/** Plain text matching (like `grep -F`), with optional `^` and `$` anchors. */
function matcher(pattern: string, ignoreCase: boolean): (row: string) => boolean {
  let body = pattern;
  const start = body.startsWith("^");
  if (start) body = body.slice(1);
  const end = body.endsWith("$") && !body.endsWith("\\$");
  if (end) body = body.slice(0, -1);
  body = body.replace(/\\(.)/g, "$1");
  const needle = ignoreCase ? body.toLowerCase() : body;
  return (row) => {
    const hay = ignoreCase ? row.toLowerCase() : row;
    if (start && end) return hay === needle;
    if (start) return hay.startsWith(needle);
    if (end) return hay.endsWith(needle);
    return hay.includes(needle);
  };
}

function headTail(ctx: Ctx, which_: "head" | "tail"): Result {
  const { flags, values, rest, bad } = options(ctx.args, "nc", true);
  if (bad) return error(`${which_}: ${bad}`);
  if (flags.has("f") || flags.has("F")) return error(`${which_}：这里不支持 -f（它会一直等待新内容）。`);
  const raw = values.n ?? "10";
  const fromStart = which_ === "tail" && raw.startsWith("+");
  if (!/^\+?\d+$/.test(raw)) return error(`${which_}: invalid number of lines: '${raw}'`);
  const count = Number(raw.replace("+", ""));
  const read = inputs(ctx, rest);
  if (read.missingInput) return NO_INPUT(which_);
  const out: string[] = [];
  read.chunks.forEach((chunk, index) => {
    const all = lines(chunk.text);
    if (read.chunks.length > 1) out.push(`${index > 0 ? "\n" : ""}==> ${chunk.name} <==`);
    out.push(...(which_ === "head" ? all.slice(0, count) : fromStart ? all.slice(Math.max(0, count - 1)) : count === 0 ? [] : all.slice(-count)));
  });
  return { out: text(out), err: read.err, code: read.err ? 1 : 0 };
}

/** Numeric (`640`) or symbolic (`u+x`, `go-w`, `a=r`) chmod modes. */
export function applyMode(current: number, spec: string): number | null {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec.slice(-3), 8);
  let mode = current;
  for (const clause of spec.split(",")) {
    const match = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!match) return null;
    const who = match[1] === "" || match[1]!.includes("a") ? "ugo" : match[1]!;
    const bits = (match[3]!.includes("r") ? 4 : 0) | (match[3]!.includes("w") ? 2 : 0) | (match[3]!.includes("x") ? 1 : 0);
    for (const target of who) {
      const shift = { u: 6, g: 3, o: 0 }[target as "u" | "g" | "o"];
      if (match[2] === "+") mode |= bits << shift;
      else if (match[2] === "-") mode &= ~(bits << shift);
      else mode = (mode & ~(7 << shift)) | (bits << shift);
    }
  }
  return mode;
}

function copyOrMove(ctx: Ctx, command: "cp" | "mv"): Result {
  const { m } = ctx;
  const { flags, rest } = options(ctx.args);
  const recursive = flags.has("r") || flags.has("R") || flags.has("a");
  const noClobber = flags.has("n") || flags.has("i");
  if (rest.length < 2) return error(rest.length === 0 ? `${command}: missing file operand` : `${command}: missing destination file operand after '${rest[0]}'`);
  const destination = rest[rest.length - 1]!;
  const sources = rest.slice(0, -1);
  const destAbs = resolve(m.cwd, destination);
  const destEntry = m.fs[destAbs];
  const intoDir = destEntry?.type === "dir";
  if (sources.length > 1 && !intoDir) return error(`${command}: target '${destination}' is not a directory`);
  const out: string[] = [];
  let err = "";
  for (const source of sources) {
    const from = resolve(m.cwd, source);
    const found = lookup(m.fs, m.user, from);
    if ("error" in found) {
      err += `${command}: cannot stat '${source}': ${MESSAGES[found.error]}\n`;
      continue;
    }
    if (found.entry.type === "dir" && command === "cp" && !recursive) {
      err += `cp: -r not specified; omitting directory '${source}'\n`;
      continue;
    }
    const to = intoDir ? join(destAbs, baseName(from)) : destAbs;
    if (to === from) {
      err += `${command}: '${source}' and '${destination}' are the same file\n`;
      continue;
    }
    if (to.startsWith(`${from}/`)) {
      err += `${command}: cannot ${command === "mv" ? "move" : "copy"} '${source}' to a subdirectory of itself\n`;
      continue;
    }
    if (command === "cp" && found.entry.type === "file" && !allowed(found.entry, m.user, "r")) {
      err += `cp: cannot open '${source}' for reading: Permission denied\n`;
      continue;
    }
    const problem = canModifyDir(m, parentOf(to)) ?? (command === "mv" ? canModifyDir(m, parentOf(from)) : null);
    if (problem) {
      err += `${command}: cannot ${command === "mv" ? "move" : "create regular file"} '${source}': ${MESSAGES[problem]}\n`;
      continue;
    }
    const existing = m.fs[to];
    if (existing) {
      if (noClobber) {
        if (flags.has("i")) err += `${command}: overwrite '${intoDir ? `${destination.replace(/\/+$/, "")}/${baseName(from)}` : destination}'? （这里不能交互，按“否”处理）\n`;
        continue;
      }
      if (existing.type === "dir") {
        err += `${command}: cannot overwrite directory '${to}' with non-directory\n`;
        continue;
      }
      if (found.entry.type === "dir") {
        err += `${command}: cannot overwrite non-directory '${to}' with directory '${source}'\n`;
        continue;
      }
      removePath(m, to);
    }
    if (command === "mv") movePath(m, from, to);
    else copyPath(m, from, to);
    if (flags.has("v")) out.push(`${command === "mv" ? "renamed " : ""}'${source}' -> '${intoDir ? `${destination.replace(/\/+$/, "")}/${baseName(from)}` : destination}'`);
  }
  return { out: text(out), err, code: err ? 1 : 0 };
}

function systemctl(m: Machine, args: string[], privileged: boolean): Result {
  const [action, rawUnit] = args;
  const unit = rawUnit?.replace(/\.service$/, "");
  if (!action || !unit) return error("systemctl：用法是 systemctl status|start|stop|restart 服务名");
  const service = m.services[unit];
  if (!service) return error(`Unit ${unit}.service could not be found.`, 4);
  if (action === "status" || action === "is-active") {
    if (action === "is-active") return { out: `${service.state}\n`, err: "", code: service.state === "active" ? 0 : 3 };
    const proc = service.pid ? m.procs.find((item) => item.pid === service.pid) : undefined;
    const state = service.state === "active" ? "active (running)" : service.state === "failed" ? "failed (Result: exit-code)" : "inactive (dead)";
    return {
      out: text([
        `${service.state === "active" ? "●" : "×"} ${unit}.service - ${service.description}`,
        `     Active: ${state}`,
        ...(proc ? [`   Main PID: ${proc.pid} (${proc.name})`] : []),
        "",
        ...service.log.slice(-6),
      ]),
      err: "",
      code: service.state === "active" ? 0 : 3,
    };
  }
  if (!["start", "stop", "restart"].includes(action)) return error(`systemctl：这里只支持 status、start、stop、restart`);
  if (!privileged) return error(`Failed to ${action} ${unit}.service: Interactive authentication required.\n（管理服务需要管理员权限：在命令前面加 sudo）`);
  if (action === "stop" || action === "restart") {
    if (service.pid) {
      m.events.push(`service-stop:${unit}`);
      const proc = m.procs.find((item) => item.pid === service.pid);
      if (proc) m.hooks.signal?.(m, proc, "TERM");
      endProcess(m, service.pid);
    }
    service.state = "inactive";
    service.log.push(`${m.clock} systemd[1]: Stopped ${unit}.service.`);
    if (action === "stop") return ok();
  }
  const problem = m.hooks.startService?.(m, unit) ?? null;
  if (problem) {
    service.state = "failed";
    service.log.push(`${m.clock} ${unit}: ${problem}`, `${m.clock} systemd[1]: Failed to start ${unit}.service.`);
    return error(`Job for ${unit}.service failed because the control process exited with error code.\nSee "systemctl status ${unit}.service" for details.`);
  }
  service.state = "active";
  service.log.push(`${m.clock} systemd[1]: Started ${unit}.service.`);
  return ok();
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type Transcript = { command: string; cwd: string; out: string; err: string; clear: boolean }[];

/** Runs a command history on a fresh machine; the browser and the validators both use this. */
export function replay(create: () => Machine, history: readonly string[]): { machine: Machine; transcript: Transcript } {
  const machine = create();
  const transcript: Transcript = [];
  for (const command of history.slice(0, LIMITS.history)) {
    const cwd = machine.cwd;
    const result = runLine(machine, command);
    transcript.push({ command, cwd, out: result.out, err: result.err, clear: result.clear === true });
  }
  return { machine, transcript };
}

export function promptPath(m: Pick<Machine, "env" | "user">, cwd: string): string {
  const home = m.env.HOME ?? USERS[m.user].home;
  return cwd === home ? "~" : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}
