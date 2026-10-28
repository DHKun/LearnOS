/**
 * Lab data and grading rules. Pure functions shared by the browser (live
 * feedback) and validators.ts (the only source of `passed`).
 */
import { type Action, LIMITS, type Repo, ancestors, fileStates, hasMarkers, headId, replay, short } from "./git";
import {
  DRAFT,
  DRAFT_PATH,
  ENV_FILE,
  HOURS_FIXED,
  HOURS_OLD,
  HOURS_WEEKEND,
  LOANS_FIXED,
  LOANS_HTML_FIXED,
  LOANS_REMAINING,
  LOANS_WEEKEND,
  ME,
  PEOPLE,
  README_WANG,
  SEARCH_INDEX,
  SEARCH_JS,
  STYLE_DRAFT,
  STYLE_MAIN,
  STYLE_WIP,
  baseCommits,
  branchRepo,
  commitRepo,
  historyRepo,
  incidentCommits,
  incidentRepo,
  indexWith,
  mergeRepo,
  name,
  remoteCommits,
  remoteRepo,
  undoBase,
  undoRepo,
} from "./site";

export type Goal = { id: string; label: string; ok: boolean; detail?: string };
export type Graded = { passed: boolean; goals: Goal[]; message: string };

const failed = (goals: Goal[]) => goals.filter((goal) => !goal.ok);
const summary = (goals: Goal[], success: string) => {
  const missing = failed(goals);
  return { passed: missing.length === 0, goals, message: missing.length ? `还没完成：${missing.map((goal) => goal.label).join("；")}。` : success };
};

function reachable(repo: Repo): Set<string> {
  const all = new Set<string>();
  for (const id of [...Object.values(repo.branches), ...Object.values(repo.remote)]) for (const seen of ancestors(repo, id)) all.add(seen);
  return all;
}

const GENERIC = /^(update|updates|fix|fixed|wip|test|commit|change|changes|修改|更新|改了|提交|改动|1|11|111|a|aa|asdf|\.)$/i;

// ---------------------------------------------------------------------------
// Ch2 · commit only what belongs together
// ---------------------------------------------------------------------------

export function gradeCommit(repo: Repo): Graded {
  const head = repo.commits[headId(repo)!]!;
  const base = baseCommits();
  const tip = base[base.length - 1]!;
  const newCommits = [...ancestors(repo, head.id)].filter((id) => !base.some((commit) => commit.id === id)).map((id) => repo.commits[id]!);
  const everLeaked = [...reachable(repo)].some((id) => repo.commits[id]!.tree[".env"] !== undefined);
  const goals: Goal[] = [
    { id: "fix", label: "两处修复（loans.js、loans.html）已经提交", ok: head.tree["loans.js"] === LOANS_FIXED && head.tree["loans.html"] === LOANS_HTML_FIXED },
    { id: "debug", label: "调试开关没有提交，但还留在工作区", ok: newCommits.length > 0 && head.tree["config.js"] === tip.tree["config.js"] && repo.work["config.js"]?.includes("DEBUG = true") === true },
    { id: "env", label: ".env 从没进过任何提交", ok: newCommits.length > 0 && !everLeaked && repo.work[".env"] === ENV_FILE },
    {
      id: "ignore",
      label: ".gitignore 写好并提交了：git status 不再提醒 .env",
      ok: (head.tree[".gitignore"] ?? "").split("\n").some((row) => /^\/?\.env$/.test(row.trim())) && !fileStates(repo).some((state) => state.path === ".env"),
    },
    {
      id: "message",
      label: "提交说明写清楚了改什么（不是 update、fix 这种）",
      ok: newCommits.length > 0 && newCommits.every((commit) => commit.message.trim().length >= 4 && !GENERIC.test(commit.message.trim())),
    },
  ];
  const result = summary(goals, "这次提交只包含两处修复和 .gitignore，调试开关和密码都没进历史。");
  if (everLeaked) result.message = ".env 已经进了提交历史：一旦推送出去，密码就等于公开了。用 git reset 撤掉那次提交（还没推送，可以改），或清空记录重来。";
  return result;
}

// ---------------------------------------------------------------------------
// Ch3 · read the history
// ---------------------------------------------------------------------------

const BASE = baseCommits();
const DAYS_COMMIT = BASE.find((commit) => commit.message === "调整样式")!;
const HOURS_COMMIT = BASE.find((commit) => commit.message === "首页加上开馆时间")!;

export const HISTORY_QUESTIONS = [
  { id: "days", question: "借阅期限从 30 天改成 14 天，是哪一次提交？（填提交号的前 7 位）" },
  { id: "who", question: "这次改动是谁提交的？", options: PEOPLE.map((person) => ({ id: name(person), label: name(person) })) },
  {
    id: "also",
    question: "那次提交还改了哪个文件？",
    options: ["index.html", "style.css", "loans.js", "README.md"].map((file) => ({ id: file, label: file })),
  },
  { id: "hours", question: "首页上“开馆时间”这一行，是哪一次提交写进去的？（填提交号的前 7 位）" },
] as const;

export type HistoryQuestionId = (typeof HISTORY_QUESTIONS)[number]["id"];

export const HISTORY_ANSWERS: Record<HistoryQuestionId, string> = {
  days: short(DAYS_COMMIT.id),
  who: name(DAYS_COMMIT.author),
  also: "style.css",
  hours: short(HOURS_COMMIT.id),
};

function sameHash(answer: string, id: string): boolean {
  const clean = answer.trim().toLowerCase();
  return clean.length >= 7 && id.startsWith(clean);
}

export function gradeHistory(answers: Partial<Record<HistoryQuestionId, string>>) {
  const results = HISTORY_QUESTIONS.map((item) => {
    const answer = answers[item.id] ?? "";
    const ok = item.id === "days" ? sameHash(answer, DAYS_COMMIT.id) : item.id === "hours" ? sameHash(answer, HOURS_COMMIT.id) : answer === HISTORY_ANSWERS[item.id];
    return { id: item.id, ok };
  });
  const correct = results.filter((item) => item.ok).length;
  const hints: string[] = [];
  const days = (answers.days ?? "").trim().toLowerCase();
  const guess = BASE.find((commit) => days.length >= 4 && commit.id.startsWith(days));
  if (guess && guess.id !== DAYS_COMMIT.id && /借阅/.test(guess.message)) hints.push("说明里写着“借阅”的提交不一定改了借阅期限：要看提交实际改了什么。");
  if (days && days.length < 7) hints.push("提交号至少写 7 位。");
  return { passed: correct === results.length, correct, total: results.length, results, hints };
}

// ---------------------------------------------------------------------------
// Ch4 · undo
// ---------------------------------------------------------------------------

export function gradeUndo(repo: Repo): Graded {
  const { typo, parent } = undoBase();
  const head = repo.commits[headId(repo)!]!;
  const message = head.message.trim();
  const goals: Goal[] = [
    { id: "restore", label: "误改的 index.html 恢复成了提交里的样子", ok: repo.work["index.html"] === SEARCH_INDEX },
    {
      id: "amend",
      label: "“搜索框”那次提交补上了 search.js，说明改成“添加搜索框”，没有多出新的提交",
      ok: head.parents.length === 1 && head.parents[0] === parent.id && head.tree["search.js"] === SEARCH_JS && head.tree["index.html"] === typo.tree["index.html"] && message.includes("搜索框") && !message.includes("搜素"),
    },
    { id: "style", label: "style.css 的改动还在工作区，但不在这次提交里，也没有暂存", ok: repo.work["style.css"] === STYLE_WIP && repo.index["style.css"] === typo.tree["style.css"] && head.tree["style.css"] === typo.tree["style.css"] },
  ];
  const result = summary(goals, "三处都收拾好了，历史里只有一次干净的“添加搜索框”。");
  if (repo.work["style.css"] !== STYLE_WIP) result.message = "style.css 里还没提交的改动丢了：git reset --hard 和 git restore 都会直接覆盖工作区。清空记录重来一次吧。";
  else if (head.tree["style.css"] !== typo.tree["style.css"]) result.message = "style.css 的改动跟着进了提交：--amend 会把暂存区里的东西一起放进去，先把它移出暂存区。";
  else if (head.parents[0] !== parent.id && head.parents[0] === typo.id) result.message = "多了一次新提交，原来那次写错了说明的提交还在历史里：要修改上一次提交，用 git commit --amend。";
  return result;
}

// ---------------------------------------------------------------------------
// Ch5 · branches
// ---------------------------------------------------------------------------

export const FEATURE = "feature/search";

export function gradeBranch(repo: Repo): Graded {
  const main = repo.branches.main ? repo.commits[repo.branches.main]! : undefined;
  const feature = repo.branches[FEATURE] ? repo.commits[repo.branches[FEATURE]!]! : undefined;
  const states = fileStates(repo);
  const featureDone = Boolean(feature && feature.tree["search.js"]?.trim() && main && !ancestors(repo, main.id).has(feature.id));
  const hotfixDone = Boolean(main && main.tree["index.html"]?.includes(HOURS_FIXED) && !main.tree["index.html"]?.includes(HOURS_OLD));
  const goals: Goal[] = [
    { id: "feature", label: `${FEATURE} 分支上提交了 search.js`, ok: featureDone },
    { id: "hotfix", label: "main 上提交了开馆时间的修正（9:00–21:00）", ok: hotfixDone },
    { id: "clean", label: "main 上没有还没做完的搜索功能", ok: featureDone && Boolean(main && main.tree["search.js"] === undefined) },
    { id: "tidy", label: "两件事都提交了，没有遗留未提交的改动", ok: featureDone && hotfixDone && states.length === 0 },
  ];
  const result = summary(goals, "搜索功能在自己的分支上慢慢做，紧急修复已经在 main 上了。");
  if (main?.tree["search.js"] !== undefined) result.message = "search.js 进了 main：提交之前没有切到新分支。可以清空记录重来，先建分支再提交。";
  return result;
}

// ---------------------------------------------------------------------------
// Ch6 · merge with a conflict
// ---------------------------------------------------------------------------

export const WEEKEND_BRANCH = "feature/weekend";

export function gradeMerge(repo: Repo): Graded {
  const start = mergeRepo();
  const head = repo.commits[headId(repo)!]!;
  const weekend = start.branches[WEEKEND_BRANCH]!;
  const html = head.tree["index.html"] ?? "";
  const markers = Object.entries(head.tree).filter(([, content]) => hasMarkers(content)).map(([path]) => path);
  const goals: Goal[] = [
    { id: "merged", label: `main 上有一个合并提交，把 ${WEEKEND_BRANCH} 合了进来`, ok: head.parents.length === 2 && ancestors(repo, head.id).has(weekend) && repo.branches.main === head.id },
    { id: "both", label: "开馆时间这一行，两边的修改都保留了", ok: html.includes("9:00–21:00") && html.includes("周末 10:00–16:00") && !html.includes("17:00") },
    { id: "markers", label: "合并提交里没有遗留冲突标记", ok: head.parents.length === 2 && markers.length === 0, detail: markers.length ? `还带着 <<<<<<< 的文件：${markers.join("、")}` : undefined },
    { id: "others", label: "另外两处不冲突的修改也都在", ok: head.tree["style.css"] === STYLE_MAIN && head.tree["loans.js"] === LOANS_WEEKEND },
    { id: "done", label: "合并已经完成，不再处于合并中", ok: head.parents.length === 2 && repo.merging === null },
  ];
  const result = summary(goals, "两边的修改都保住了：工作日的新时间和周末的开放时间写在同一行。");
  if (markers.length) result.message = "冲突标记被一起提交了：<<<<<<<、=======、>>>>>>> 这几行要删掉，只留下最终想要的内容。";
  else if (head.parents.length === 2 && !goals[1]!.ok) result.message = "合并提交里只保留了一边的修改：工作日 9:00–21:00 和周末 10:00–16:00 都要留下。";
  return result;
}

// ---------------------------------------------------------------------------
// Ch7 · push rejected
// ---------------------------------------------------------------------------

export function gradeRemote(repo: Repo): Graded {
  const { mine, wang } = remoteCommits();
  const remote = repo.remote.main;
  const onRemote = remote ? ancestors(repo, remote) : new Set<string>();
  const tree = remote ? repo.commits[remote]!.tree : {};
  const forced = repo.events.some((event) => event.startsWith("force-push"));
  const pushed = tree["loans.js"] === LOANS_REMAINING && [...onRemote].some((id) => repo.commits[id]!.author === ME && repo.commits[id]!.message === mine.message);
  const goals: Goal[] = [
    { id: "mine", label: "你的提交推送到了远程 main", ok: pushed },
    { id: "wang", label: "推送之后，小王先推上去的提交还在远程 main 上", ok: pushed && onRemote.has(wang.id) && tree["README.md"] === README_WANG },
    { id: "force", label: "推送成功，而且没有用强制推送", ok: pushed && !forced },
    { id: "synced", label: "本地 main 和远程 main 一致", ok: repo.branches.main === remote },
  ];
  const result = summary(goals, "先把小王的提交拉下来合并，再推上去：两个人的工作都在。");
  if (!onRemote.has(wang.id) && forced) result.message = "git push --force 把小王的提交从远程上抹掉了。被拒绝时要先 git pull 合并别人的提交，再推送。清空记录重来一次吧。";
  return result;
}

// ---------------------------------------------------------------------------
// Ch8 · undo a pushed commit
// ---------------------------------------------------------------------------

export function gradeIncident(repo: Repo): Graded {
  const { helper, readme, weekend } = incidentCommits();
  const remote = repo.remote.main;
  const onRemote = remote ? ancestors(repo, remote) : new Set<string>();
  const tree = remote ? repo.commits[remote]!.tree : {};
  const forced = repo.events.some((event) => event.startsWith("force-push"));
  const goals: Goal[] = [
    { id: "fixed", label: "远程 main 上的到期日期算对了", ok: (tree["loans.js"] ?? "").includes("addDays(borrowed, LOAN_DAYS)") && !(tree["loans.js"] ?? "").includes("-LOAN_DAYS") },
    { id: "kept", label: "陈静和小王后来的两次提交还在", ok: onRemote.has(readme.id) && onRemote.has(weekend.id) && tree["README.md"] === README_WANG && tree["index.html"] === indexWith(HOURS_WEEKEND) },
    { id: "history", label: "没有改写已经推送的历史", ok: !forced && onRemote.has(helper.id) },
    { id: "draft", label: "你手头还没提交的草稿都还在", ok: repo.work["style.css"] === STYLE_DRAFT && repo.work[DRAFT_PATH] === DRAFT },
  ];
  const result = summary(goals, "线上修好了，别人的提交和你的草稿都没受影响。已经推送的提交，用 revert 撤销。");
  if (forced || !onRemote.has(readme.id)) result.message = "已经推送出去的历史被改写了：别人的提交从远程上消失了。撤销已经推送的提交要用 git revert，它会新增一次“反向”的提交。";
  else if (repo.work["style.css"] !== STYLE_DRAFT || repo.work[DRAFT_PATH] !== DRAFT) result.message = "你手头还没提交的草稿丢了。git reset --hard、git restore 会直接覆盖工作区里的改动。";
  else if (!goals[0]!.ok && (tree["index.html"] ?? "").includes(HOURS_OLD) && !(tree["index.html"] ?? "").includes("周末")) result.message = "撤销的不是引入问题的那次提交：先用 git log -p 找出是哪次提交改坏了 loans.js。";
  return result;
}

// ---------------------------------------------------------------------------
// Repositories for each lab, and input parsing
// ---------------------------------------------------------------------------

export const REPOS = {
  commit: commitRepo,
  history: historyRepo,
  undo: undoRepo,
  branch: branchRepo,
  merge: mergeRepo,
  remote: remoteRepo,
  incident: incidentRepo,
} as const;

export type RepoId = keyof typeof REPOS;

export function replayLab(id: RepoId, actions: readonly Action[]) {
  return replay(REPOS[id], actions);
}

/** Bounds-checked action history from untrusted input, or null. */
export function parseActions(value: unknown): Action[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.history) return null;
  const actions: Action[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      if (item.length > LIMITS.command) return null;
      actions.push(item);
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const { edit, content } = item as Record<string, unknown>;
      if (typeof edit !== "string" || typeof content !== "string" || edit.length > LIMITS.path || content.length > LIMITS.content || !/^[\w.\-/]+$/.test(edit) || edit.split("/").includes("..")) return null;
      actions.push({ edit, content });
    } else return null;
  }
  return actions;
}
