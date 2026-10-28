/**
 * The library.test website's repository, as the developer 林可 sees it.
 * Every lab starts from one moment in the same project history.
 */
import { type Commit, type Repo, type Tree, makeCommit } from "./git";

export const ME = "林可 <linke@library.test>";
export const WANG = "王磊 <wanglei@library.test>";
export const CHEN = "陈静 <chenjing@library.test>";
export const PEOPLE = [ME, WANG, CHEN];
export const name = (author: string) => author.replace(/ <.*$/, "");

export const INDEX_V1 = `<!doctype html>
<title>小城图书馆</title>
<h1>小城图书馆</h1>
<a href="/loans.html">我的借阅</a>
`;

export const HOURS_OLD = "<p>开馆时间：周一至周五 9:00–17:00</p>";
export const HOURS_FIXED = "<p>开馆时间：周一至周五 9:00–21:00</p>";
export const HOURS_WEEKEND = "<p>开馆时间：周一至周五 9:00–17:00，周末 10:00–16:00</p>";

export const indexWith = (hours: string, extra = "") => `<!doctype html>
<title>小城图书馆</title>
<h1>小城图书馆</h1>
${hours}
<a href="/loans.html">我的借阅</a>
${extra}`;

export const CONFIG = (days: number, debug = false) => `export const LOAN_DAYS = ${days};
export const MAX_LOANS = 5;
export const DEBUG = ${debug};
`;

export const LOANS_JS = (due = "addDays(borrowed, LOAN_DAYS)", limit = "user.loans.length < MAX_LOANS", extra = "") => `import { LOAN_DAYS, MAX_LOANS } from "./config.js";

export function dueDate(borrowed) {
  return ${due};
}

export function canBorrow(user) {
  return ${limit};
}
${extra}`;

export const LOANS_HTML = (heading = "我的借阅") => `<!doctype html>
<title>${heading} · 小城图书馆</title>
<h1>${heading}</h1>
<table id="loans"></table>
<script type="module" src="/loans.js"></script>
`;

export const STYLE = (accent = "#2f6f4f", extra = "") => `body { font-family: sans-serif; margin: 2rem; }
h1 { color: ${accent}; }
${extra}`;

export const README = (extra = "") => `# library-site

小城图书馆网站（library.test）的源代码。
${extra}`;

/** The shared project history up to the start of the course, oldest first. */
function baseHistory(repo: Repo): Commit[] {
  const steps: [string, string, string, Tree][] = [
    [CHEN, "2026-10-20 10:02", "初始化网站", { "README.md": README(), "index.html": INDEX_V1, "style.css": STYLE() }],
    [CHEN, "2026-10-21 14:30", "添加借阅页", { "loans.html": LOANS_HTML("借阅记录"), "loans.js": LOANS_JS(), "config.js": CONFIG(30) }],
    [WANG, "2026-10-22 09:15", "首页加上开馆时间", { "index.html": indexWith(HOURS_OLD) }],
    [ME, "2026-10-23 16:40", "借阅页显示到期日期", { "loans.html": LOANS_HTML("借阅记录").replace("</table>", "</table>\n<p id=\"due\"></p>") }],
    [WANG, "2026-10-24 11:05", "调整样式", { "style.css": STYLE("#1f5f8b"), "config.js": CONFIG(14) }],
    [CHEN, "2026-10-25 10:20", "修正 README 错别字", { "README.md": README("\n本地预览：用浏览器打开 index.html。\n") }],
    [ME, "2026-10-27 15:12", "借阅页标题改为“我的借阅”", { "loans.html": LOANS_HTML().replace("</table>", "</table>\n<p id=\"due\"></p>") }],
  ];
  let tree: Tree = {};
  let parent: string | undefined;
  const commits: Commit[] = [];
  for (const [author, time, message, changes] of steps) {
    tree = { ...tree, ...changes };
    const commit = makeCommit(repo, parent ? [parent] : [], tree, message, author, time);
    commits.push(commit);
    parent = commit.id;
  }
  return commits;
}

function emptyRepo(): Repo {
  return {
    commits: {},
    known: new Set(),
    branches: {},
    head: { branch: "main" },
    index: {},
    work: {},
    remote: {},
    tracking: {},
    upstream: { main: "main" },
    merging: null,
    user: ME,
    clock: 0,
    events: [],
  };
}

/** A clone whose main, origin/main and the remote all point at `tip`, with a clean working tree. */
function cloneAt(repo: Repo, tip: Commit): Repo {
  repo.branches.main = tip.id;
  repo.remote.main = tip.id;
  repo.tracking.main = tip.id;
  repo.index = { ...tip.tree };
  repo.work = { ...tip.tree };
  for (const id of Object.keys(repo.commits)) repo.known.add(id);
  return repo;
}

function after(repo: Repo, parent: Commit, author: string, time: string, message: string, changes: Tree, remove: string[] = []): Commit {
  const tree = { ...parent.tree, ...changes };
  for (const path of remove) delete tree[path];
  return makeCommit(repo, [parent.id], tree, message, author, time);
}

/** The base history, exposed for graders that need fixed commit ids. */
export function baseCommits(): Commit[] {
  return baseHistory(emptyRepo());
}

// Ch2 · first commit --------------------------------------------------------

export const LOANS_FIXED = LOANS_JS("addDays(borrowed, LOAN_DAYS)", "user.loans.length < MAX_LOANS && !user.blocked");
export const LOANS_HTML_FIXED = LOANS_HTML().replace("</table>", "</table>\n<p id=\"due\"></p>\n<p id=\"limit\">每人最多同时借 5 本</p>");
export const ENV_FILE = "DATABASE_URL=postgres://library:Lib-2026-Pw@127.0.0.1:5432/library\n";

export function commitRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  cloneAt(repo, commits[commits.length - 1]!);
  repo.work["loans.js"] = LOANS_FIXED;
  repo.work["loans.html"] = LOANS_HTML_FIXED;
  repo.work["config.js"] = CONFIG(14, true);
  repo.work[".env"] = ENV_FILE;
  return repo;
}

// Ch3 · history -------------------------------------------------------------

export function historyRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  return cloneAt(repo, commits[commits.length - 1]!);
}

// Ch4 · undo ----------------------------------------------------------------

export const SEARCH_INDEX = indexWith(HOURS_OLD, '<input id="search" placeholder="搜索书名">\n<script src="/search.js"></script>\n');
export const SEARCH_JS = 'document.querySelector("#search").addEventListener("input", (event) => filterBooks(event.target.value));\n';
export const STYLE_WIP = STYLE("#1f5f8b", "#search { width: 16rem; }\n");

export function undoRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  const last = commits[commits.length - 1]!;
  const typo = after(repo, last, ME, "2026-10-28 08:50", "添加搜素框", { "index.html": SEARCH_INDEX });
  cloneAt(repo, last);
  repo.branches.main = typo.id;
  repo.known.add(typo.id);
  repo.index = { ...typo.tree, "style.css": STYLE_WIP };
  repo.work = { ...typo.tree, "style.css": STYLE_WIP, "search.js": SEARCH_JS, "index.html": SEARCH_INDEX.replace('<a href="/loans.html">我的借阅</a>\n', "") };
  return repo;
}

export function undoBase(): { typo: Commit; parent: Commit } {
  const repo = undoRepo();
  const typo = repo.commits[repo.branches.main!]!;
  return { typo, parent: repo.commits[typo.parents[0]!]! };
}

// Ch5 · branches ------------------------------------------------------------

export function branchRepo(): Repo {
  return historyRepo();
}

// Ch6 · merge -----------------------------------------------------------------

export const LOANS_WEEKEND = LOANS_JS("addDays(borrowed, LOAN_DAYS)", "user.loans.length < MAX_LOANS", "\nexport const WEEKEND_RETURN = true;\n");
export const STYLE_MAIN = STYLE("#1f5f8b", "a { color: #1f5f8b; }\n");

export function mergeRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  const base = commits[commits.length - 1]!;
  const weekendHours = after(repo, base, WANG, "2026-10-28 09:20", "首页加上周末开馆时间", { "index.html": indexWith(HOURS_WEEKEND) });
  const weekendReturn = after(repo, weekendHours, WANG, "2026-10-28 09:35", "周末也能还书", { "loans.js": LOANS_WEEKEND });
  const hotfix = after(repo, base, ME, "2026-10-28 09:40", "修正工作日开馆时间", { "index.html": indexWith(HOURS_FIXED) });
  const links = after(repo, hotfix, CHEN, "2026-10-28 09:55", "链接颜色和标题一致", { "style.css": STYLE_MAIN });
  cloneAt(repo, links);
  repo.branches["feature/weekend"] = weekendReturn.id;
  return repo;
}

// Ch7 · remote --------------------------------------------------------------

export const LOANS_REMAINING = LOANS_JS("addDays(borrowed, LOAN_DAYS)", "user.loans.length < MAX_LOANS", "\nexport function daysLeft(due, today) {\n  return Math.ceil((due - today) / 86400000);\n}\n");
export const README_WANG = README("\n本地预览：用浏览器打开 index.html。\n\n部署：合并到 main 后自动发布。\n");

export function remoteRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  const base = commits[commits.length - 1]!;
  cloneAt(repo, base);
  const mine = after(repo, base, ME, "2026-10-28 10:05", "借阅页显示剩余天数", { "loans.js": LOANS_REMAINING });
  const wang = after(repo, base, WANG, "2026-10-28 10:12", "README 补充部署说明", { "README.md": README_WANG });
  repo.known.add(mine.id);
  repo.branches.main = mine.id;
  repo.index = { ...mine.tree };
  repo.work = { ...mine.tree };
  repo.remote.main = wang.id;
  repo.known.delete(wang.id);
  return repo;
}

export function remoteCommits(): { mine: Commit; wang: Commit } {
  const repo = remoteRepo();
  return { mine: repo.commits[repo.branches.main!]!, wang: repo.commits[repo.remote.main!]! };
}

// Ch8 · incident ----------------------------------------------------------

export const LOANS_BUG = LOANS_JS("addDays(borrowed, -LOAN_DAYS)", "user.loans.length < MAX_LOANS", "\nfunction addDays(date, days) {\n  return new Date(date.getTime() + days * 86400000);\n}\n");
export const DRAFT_PATH = "docs/search-plan.md";
export const DRAFT = "# 搜索功能计划（草稿）\n\n- 按书名搜索\n- 按作者搜索\n";
export const STYLE_DRAFT = STYLE("#1f5f8b", "#search { width: 16rem; }\n");

export function incidentRepo(): Repo {
  const repo = emptyRepo();
  const commits = baseHistory(repo);
  const base = commits[commits.length - 1]!;
  const helper = after(repo, base, WANG, "2026-10-28 13:10", "借阅页改用自己的日期函数", { "loans.js": LOANS_BUG });
  const readme = after(repo, helper, CHEN, "2026-10-28 13:40", "README 补充部署说明", { "README.md": README_WANG });
  const weekend = after(repo, readme, WANG, "2026-10-28 14:05", "首页加上周末开馆时间", { "index.html": indexWith(HOURS_WEEKEND) });
  cloneAt(repo, weekend);
  repo.work["style.css"] = STYLE_DRAFT;
  repo.work[DRAFT_PATH] = DRAFT;
  return repo;
}

export function incidentCommits(): { helper: Commit; readme: Commit; weekend: Commit } {
  const repo = incidentRepo();
  const weekend = repo.commits[repo.branches.main!]!;
  const readme = repo.commits[weekend.parents[0]!]!;
  const helper = repo.commits[readme.parents[0]!]!;
  return { helper, readme, weekend };
}
