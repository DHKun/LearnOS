/**
 * Lab data and grading rules. Pure functions shared by the browser (live
 * feedback) and validators.ts (the only source of `passed`).
 */
import {
  ACCESS_LOG,
  BACKUPS,
  DEBUG_LOG,
  FIRST_ERROR_SECONDS,
  INBOX,
  INBOX_FILES,
  INCOMING,
  IN_FLIGHT,
  KEEP_LOGS,
  OLD_WEB_PID,
  REPORT_ORIGINAL,
  REPORT_PATH,
  UPLOADS,
  WORKER_PID,
  baseFs,
  cloneFs,
  diskMachine,
  envFs,
  envMachine,
  filesMachine,
  logsMachine,
  pathsMachine,
  pipesMachine,
  processMachine,
} from "./server";
import {
  type Entry,
  type Fs,
  type Machine,
  type User,
  USERS,
  allowed,
  childrenOf,
  classOf,
  diskPercent,
  expandTilde,
  join,
  modeString,
  replay,
  resolve,
  which,
} from "./shell";

export type Goal = { id: string; label: string; ok: boolean; detail?: string };
export type Graded = { passed: boolean; goals: Goal[]; message: string };

const failed = (goals: Goal[]) => goals.filter((goal) => !goal.ok);

export const HISTORY_MAX = 40;
export const COMMAND_MAX = 200;

// ---------------------------------------------------------------------------
// Ch2 · the deploy settings must work from wherever the script runs
// ---------------------------------------------------------------------------

export const PATH_CONTEXTS = [
  { id: "manual", label: "小王手动运行", user: "ops" as User, cwd: "/srv/library" },
  { id: "cron", label: "定时任务运行", user: "deploy" as User, cwd: "/home/deploy" },
] as const;

export type PathKey = "static" | "uploads" | "release" | "logs";

export const PATH_SETTINGS: { key: PathKey; label: string; want: string; target: string; initial: string }[] = [
  { key: "static", label: "static", want: "网站的静态文件：就是小王手动运行时用的那个目录", target: "/srv/library/static", initial: "static" },
  { key: "uploads", label: "uploads", want: "共享上传目录：也是小王手动运行时用的那个", target: "/srv/shared/uploads", initial: "../shared/uploads" },
  { key: "release", label: "release", want: "当前发布的版本：/srv/library 下面那个保存各次发布的目录里的 current", target: "/srv/library/releases/current", initial: "release/current" },
  { key: "logs", label: "logs", want: "部署日志目录：定时任务现在写日志的那个目录", target: "/home/deploy/logs", initial: "~/logs" },
];

export const PATHS_INITIAL: Record<PathKey, string> = Object.fromEntries(PATH_SETTINGS.map((item) => [item.key, item.initial])) as Record<PathKey, string>;

const PATHS_FS = baseFs();

export function resolveSetting(value: string, context: (typeof PATH_CONTEXTS)[number]): { path: string; exists: boolean } {
  const expanded = expandTilde(value.trim(), USERS[context.user].home);
  const path = resolve(context.cwd, expanded);
  return { path, exists: PATHS_FS[path]?.type === "dir" };
}

export function evaluatePaths(values: Record<PathKey, string>) {
  const rows = PATH_SETTINGS.map((setting) => {
    const value = values[setting.key] ?? "";
    const cells = PATH_CONTEXTS.map((context) => {
      const result = value.trim() === "" ? { path: "", exists: false } : resolveSetting(value, context);
      const ok = result.exists && result.path === setting.target;
      const note = value.trim() === "" ? "没有填写" : !result.exists ? "这个目录不存在" : ok ? "正确" : "目录存在，但不是要找的那个";
      return { context: context.id, path: result.path, ok, note };
    });
    return { ...setting, value, cells, ok: cells.every((cell) => cell.ok) };
  });
  return { rows, passed: rows.every((row) => row.ok) };
}

// ---------------------------------------------------------------------------
// Ch3 · tidy the upload inbox
// ---------------------------------------------------------------------------

function filesWithContent(fs: Fs, dir: string): string[] {
  return childrenOf(fs, dir)
    .map((name) => fs[join(dir, name)]!)
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.content);
}

export function gradeFiles(m: Machine): Graded {
  const all = Object.entries(m.fs).filter(([, entry]) => entry.type === "file");
  const contents = new Set(all.map(([, entry]) => entry.content));
  const images = INBOX_FILES.filter((item) => item.kind === "image");
  const docs = INBOX_FILES.filter((item) => item.kind === "doc");
  const keep = INBOX_FILES.filter((item) => item.kind !== "tmp");
  const inImages = filesWithContent(m.fs, `${UPLOADS}/images`);
  const inDocs = filesWithContent(m.fs, `${UPLOADS}/docs`);
  const lost = keep.filter((item) => !contents.has(item.content));
  const tmpLeft = all.filter(([path]) => path.startsWith(`${UPLOADS}/`) && path.endsWith(".tmp"));
  const inboxChildren = m.fs[INBOX]?.type === "dir" ? childrenOf(m.fs, INBOX) : null;
  const htaccess = m.fs[`${INBOX}/.htaccess`];
  const goals: Goal[] = [
    { id: "images", label: "三张图片都在 uploads/images/ 里", ok: images.every((item) => inImages.includes(item.content)) },
    { id: "docs", label: "三份 PDF 都在 uploads/docs/ 里", ok: docs.every((item) => inDocs.includes(item.content)) },
    { id: "tmp", label: "uploads 下面一个 .tmp 文件都不剩", ok: tmpLeft.length === 0 },
    {
      id: "inbox",
      label: "inbox/ 里只剩下 .htaccess",
      ok: inboxChildren !== null && inboxChildren.length === 1 && htaccess?.content === INBOX_FILES.find((item) => item.kind === "keep")!.content,
    },
    {
      id: "lost",
      label: "没有文件丢失",
      ok: lost.length === 0,
      detail: lost.length ? `找不到了：${lost.map((item) => item.content.trim()).join("、")}` : undefined,
    },
  ];
  const missing = failed(goals);
  return {
    passed: missing.length === 0,
    goals,
    message:
      missing.length === 0
        ? "上传目录整理好了，两份年度报告都在。"
        : lost.length
          ? `有文件被覆盖或删掉了：${lost.map((item) => item.content.trim()).join("、")}。mv 和 cp 遇到同名文件会直接覆盖，不会提醒。清空记录重来一次吧。`
          : `还没完成：${missing.map((goal) => goal.label).join("；")}。`,
  };
}

// ---------------------------------------------------------------------------
// Ch4 · read the logs
// ---------------------------------------------------------------------------

export const LOG_CAUSES = [
  { id: "disk", label: "磁盘空间不足" },
  { id: "db", label: "数据库的连接数用完了" },
  { id: "cert", label: "邮件服务器的证书快过期了" },
  { id: "slow", label: "有一条查询太慢" },
] as const;

export const LOG_QUESTIONS = [
  { id: "first", question: "今天第一次出现 500（状态码）是几点几分几秒？格式如 07:00:00" },
  { id: "path", question: "第一次出现 500 的请求，访问的是哪个地址？（只写路径，如 /books）" },
  { id: "count", question: "到日志结束为止，状态码为 500 的请求一共有多少条？" },
  { id: "cause", question: "对照 error.log，500 的原因是什么？", options: LOG_CAUSES },
] as const;

export type LogQuestionId = (typeof LOG_QUESTIONS)[number]["id"];

const firstError = ACCESS_LOG.rows.find((row) => row.status === 500)!;

export const LOG_ANSWERS: Record<LogQuestionId, string> = {
  first: firstError.time,
  path: firstError.path,
  count: String(ACCESS_LOG.rows.filter((row) => row.status === 500).length),
  cause: "db",
};

function normalizeAnswer(id: LogQuestionId, value: string): string {
  const trimmed = value.trim();
  if (id === "first") return trimmed.replace(/^(\d):/, "0$1:");
  if (id === "path") return trimmed.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/(.)\/$/, "$1");
  if (id === "count") return trimmed.replace(/[条次\s]/g, "");
  return trimmed;
}

export function gradeLogs(answers: Partial<Record<LogQuestionId, string>>) {
  const results = LOG_QUESTIONS.map((item) => ({ id: item.id, ok: normalizeAnswer(item.id, answers[item.id] ?? "") === LOG_ANSWERS[item.id] }));
  const correct = results.filter((item) => item.ok).length;
  const hints: string[] = [];
  const first = normalizeAnswer("first", answers.first ?? "");
  const trap = ACCESS_LOG.rows.find((row) => row.time === first && row.status !== 500);
  if (trap) hints.push(`${first} 这一行的状态码是 ${trap.status}：“500”出现在了别的位置（比如响应大小或地址里）。`);
  else if (first && first !== LOG_ANSWERS.first && toSeconds(first) > FIRST_ERROR_SECONDS) hints.push("这不是第一次：更早的时候已经有 500 了。");
  return { passed: correct === results.length, correct, total: results.length, results, hints };
}

function toSeconds(time: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : -1;
}

// ---------------------------------------------------------------------------
// Ch5 · top visitors appended to the weekly report
// ---------------------------------------------------------------------------

export const TOP_VISITORS = (() => {
  const counts = new Map<string, number>();
  for (const row of ACCESS_LOG.rows) counts.set(row.ip, (counts.get(row.ip) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ip, count]) => ({ ip, count }));
})();

export function gradePipes(m: Machine): Graded {
  const report = m.fs[REPORT_PATH];
  const content = report?.type === "file" ? report.content : "";
  const kept = content.startsWith(REPORT_ORIGINAL);
  const added = kept ? content.slice(REPORT_ORIGINAL.length) : "";
  const pairs = added
    .split("\n")
    .map((row) => /^\s*(\d+)\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(row) ?? /^\s*(\d+\.\d+\.\d+\.\d+)\s+(\d+)\s*$/.exec(row))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => (match[1]!.includes(".") ? { ip: match[1]!, count: Number(match[2]) } : { ip: match[2]!, count: Number(match[1]) }));
  const right = pairs.length === 3 && pairs.every((pair, index) => pair.ip === TOP_VISITORS[index]!.ip && pair.count === TOP_VISITORS[index]!.count);
  const sameSet = pairs.length === 3 && TOP_VISITORS.every((top) => pairs.some((pair) => pair.ip === top.ip && pair.count === top.count));
  const goals: Goal[] = [
    { id: "kept", label: "周报原来的内容一字不差地留着", ok: kept },
    { id: "top", label: "末尾追加了访问次数最多的 3 个 IP 和次数，从多到少", ok: kept && right },
  ];
  let message = "周报更新好了。";
  if (!kept) message = report ? "周报原来的内容变了：> 会先把文件清空再写，追加要用 >>。清空记录重来一次吧。" : "周报文件不见了。";
  else if (pairs.length === 0) message = "周报末尾还没有“次数 IP”这样的行。";
  else if (sameSet && !right) message = "三个 IP 和次数都对，但顺序不是从多到少。";
  else if (!right) message = pairs.length !== 3 ? `末尾有 ${pairs.length} 行“次数 IP”，应该正好 3 行。` : "次数或 IP 不对。uniq -c 只合并相邻的相同行，数之前要先让相同的 IP 排在一起。";
  return { passed: kept && right, goals, message };
}

// ---------------------------------------------------------------------------
// Ch6 · permissions: enough, and no more
// ---------------------------------------------------------------------------

export type PermKey = "static" | "index" | "uploads" | "deploy" | "config" | "db";

export const PERM_ITEMS: { key: PermKey; path: string; type: "dir" | "file"; initial: string }[] = [
  { key: "static", path: "/srv/library/static", type: "dir", initial: "740" },
  { key: "index", path: "/srv/library/static/index.html", type: "file", initial: "640" },
  { key: "uploads", path: "/srv/library/uploads", type: "dir", initial: "755" },
  { key: "deploy", path: "/srv/library/bin/deploy.sh", type: "file", initial: "644" },
  { key: "config", path: "/srv/library/config", type: "dir", initial: "755" },
  { key: "db", path: "/srv/library/config/db.env", type: "file", initial: "644" },
];

export const PERMS_INITIAL: Record<PermKey, string> = Object.fromEntries(PERM_ITEMS.map((item) => [item.key, item.initial])) as Record<PermKey, string>;

type Check = { user: User; path: string; need: ("r" | "w" | "x")[]; on?: "dir" };
const PERM_SCENARIOS: { id: string; label: string; expect: boolean; check: Check }[] = [
  { id: "read-page", label: "网站（www-data）能读到首页 index.html", expect: true, check: { user: "www-data", path: "/srv/library/static/index.html", need: ["r"] } },
  { id: "upload", label: "网站能把用户上传的文件存进 uploads/", expect: true, check: { user: "www-data", path: "/srv/library/uploads", need: ["w", "x"] } },
  { id: "read-db", label: "网站能读到数据库配置 db.env", expect: true, check: { user: "www-data", path: "/srv/library/config/db.env", need: ["r"] } },
  { id: "deploy", label: "你（ops）能运行 deploy.sh", expect: true, check: { user: "ops", path: "/srv/library/bin/deploy.sh", need: ["r", "x"] } },
  { id: "edit", label: "你（ops）还能修改 index.html 和 db.env", expect: true, check: { user: "ops", path: "/srv/library/static/index.html", need: ["w"] } },
  { id: "leak-db", label: "其他用户（guest）读不到 db.env 里的数据库密码", expect: false, check: { user: "guest", path: "/srv/library/config/db.env", need: ["r"] } },
  { id: "guest-upload", label: "其他用户不能往 uploads/ 里放文件", expect: false, check: { user: "guest", path: "/srv/library/uploads", need: ["w", "x"] } },
  { id: "guest-edit", label: "其他用户不能改首页", expect: false, check: { user: "guest", path: "/srv/library/static/index.html", need: ["w"] } },
];

export function parseMode(value: string): number | null {
  return /^[0-7]{3}$/.test(value.trim()) ? parseInt(value.trim(), 8) : null;
}

export function permissionFs(modes: Record<PermKey, string>): Fs | null {
  const fs = cloneFs(baseFs());
  for (const item of PERM_ITEMS) {
    const mode = parseMode(modes[item.key] ?? "");
    if (mode === null) return null;
    fs[item.path] = { ...fs[item.path]!, mode };
  }
  return fs;
}

/** Why `user` can or cannot do it, one step per directory on the way. */
function explain(fs: Fs, check: Check): { granted: boolean; why: string } {
  const parts = check.path.split("/").filter(Boolean);
  let current = "/";
  for (const part of parts.slice(0, -1)) {
    current = join(current, part);
    const entry = fs[current]!;
    if (!allowed(entry, check.user, "x")) return { granted: false, why: `进不去 ${current}/：${check.user} 在这里算“${role(entry, check.user)}”，没有 x` };
  }
  const entry = fs[check.path]!;
  const missing = check.need.filter((need) => !allowed(entry, check.user, need));
  const names = { r: "读（r）", w: "写（w）", x: "执行/进入（x）" };
  if (missing.length) return { granted: false, why: `${check.path} 对 ${check.user}（${role(entry, check.user)}）没有${missing.map((need) => names[need]).join("、")}` };
  return { granted: true, why: `${check.user} 是“${role(entry, check.user)}”，${modeString(entry).slice(1)} 允许` };
}

function role(entry: Entry, user: User): string {
  return { owner: "主人", group: `${entry.group} 组成员`, other: "其他人" }[classOf(entry, user)];
}

export function evaluatePerms(modes: Record<PermKey, string>) {
  const fs = permissionFs(modes);
  const invalid = PERM_ITEMS.filter((item) => parseMode(modes[item.key] ?? "") === null).map((item) => item.path);
  if (!fs) {
    return {
      passed: false,
      invalid,
      scenarios: PERM_SCENARIOS.map((scenario) => ({ id: scenario.id, label: scenario.label, ok: false, why: "有权限写得不对，系统不接受这组设置" })),
      listing: [],
    };
  }
  const scenarios = PERM_SCENARIOS.map((scenario) => {
    const result = explain(fs, scenario.check);
    const extra = scenario.id === "edit" && result.granted ? explain(fs, { ...scenario.check, path: "/srv/library/config/db.env" }) : null;
    const granted = result.granted && (extra?.granted ?? true);
    return { id: scenario.id, label: scenario.label, ok: granted === scenario.expect, why: extra && !extra.granted ? extra.why : result.why };
  });
  const listing = PERM_ITEMS.map((item) => {
    const entry = fs[item.path]!;
    return `${modeString(entry)} ${entry.owner} ${entry.group} ${item.path}`;
  });
  return { passed: scenarios.every((scenario) => scenario.ok), invalid, scenarios, listing };
}

// ---------------------------------------------------------------------------
// Ch7 · port 80 is taken
// ---------------------------------------------------------------------------

export function gradeProcesses(m: Machine): Graded {
  const web = m.services["library-web"]!;
  const listener = m.procs.find((proc) => proc.port === 80);
  const killedHard = m.events.includes(`kill:${OLD_WEB_PID}:KILL`);
  const parts = IN_FLIGHT.filter((name) => m.fs[`${INCOMING}/${name}.part`]);
  const complete = IN_FLIGHT.every((name) => m.fs[`${INCOMING}/${name}`]?.content.includes("完整"));
  const goals: Goal[] = [
    { id: "new", label: "网站由 systemd 管理，跑的是新版本 1.4.0", ok: web.state === "active" && listener !== undefined && listener.pid === web.pid },
    { id: "old", label: "昨晚手动启动的旧进程已经结束", ok: !m.procs.some((proc) => proc.pid === OLD_WEB_PID) },
    { id: "others", label: "数据库和后台任务（library-worker）照常运行", ok: m.procs.some((proc) => proc.name === "postgres") && m.procs.some((proc) => proc.pid === WORKER_PID) },
    { id: "uploads", label: "正在上传的两份文件完整保存了", ok: !killedHard && parts.length === 0 && complete },
  ];
  const missing = failed(goals);
  let message = "新版本上线了，旧进程体面地退出，正在上传的文件也保住了。";
  if (killedHard) message = "旧进程是被 kill -9 强行结束的：它没机会把正在上传的两份文件写完，uploads/incoming 里留下了只有一半的 .part 文件。先用默认的 TERM 信号，它不理你再用 -9。清空记录重来一次吧。";
  else if (!m.procs.some((proc) => proc.pid === WORKER_PID)) message = "library-worker 被停掉了：它负责发借阅提醒邮件，和占着 80 端口没有关系。清空记录重来一次吧。";
  else if (missing.length) message = `还没完成：${missing.map((goal) => goal.label).join("；")}。`;
  return { passed: missing.length === 0, goals, message };
}

// ---------------------------------------------------------------------------
// Ch8 · PATH, now and after the next login
// ---------------------------------------------------------------------------

const SYSTEM_COMMANDS = ["ls", "grep", "cat", "git"];

function envChecks(m: Machine) {
  const resolved = (name: string) => which(m, name)[0];
  return {
    libctl: resolved("libctl") === "/opt/libctl/bin/libctl",
    node: resolved("node") === "/opt/node20/bin/node",
    system: SYSTEM_COMMANDS.every((name) => {
      const hit = resolved(name);
      return hit === `/bin/${name}` || hit === `/usr/bin/${name}`;
    }),
  };
}

export function evaluateEnv(m: Machine) {
  const now = envChecks(m);
  const next = envMachine(cloneFs(m.fs));
  const later = envChecks(next);
  const bashrc = m.fs[`${USERS.ops.home}/.bashrc`]?.content ?? "";
  const keptRc = bashrc.includes("alias ll='ls -l'") && bashrc.includes("export EDITOR=nano");
  const rows = [
    { id: "libctl", label: "敲 libctl 能找到它", now: now.libctl, later: later.libctl },
    { id: "node", label: "node --version 是 v20", now: now.node, later: later.node },
    { id: "system", label: "ls、grep、cat、git 照常能用", now: now.system, later: later.system },
    { id: "rc", label: "~/.bashrc 里原来的设置还在", now: keptRc, later: keptRc },
  ];
  return { rows, passed: rows.every((row) => row.now && row.later) };
}

export function gradeEnv(m: Machine): Graded {
  const result = evaluateEnv(m);
  const goals = result.rows.map((row) => ({ id: row.id, label: row.label, ok: row.now && row.later }));
  const rc = result.rows.find((row) => row.id === "rc")!;
  const nodeRow = result.rows.find((row) => row.id === "node")!;
  let message = "现在和下次登录后都没问题了。";
  if (!rc.now) message = "~/.bashrc 原来的内容（别名 ll 和 EDITOR）不见了：往配置文件里加内容要用 >>。清空记录重来一次吧。";
  else if (result.rows.every((row) => row.now) && !result.passed) message = "现在能用了，但重新登录后又不行：export 只对当前这次登录有效，要写进 ~/.bashrc 才能每次都生效。";
  else if (!result.rows.find((row) => row.id === "system")!.now) message = "系统命令找不到了：PATH 被整个换掉了，原来的 /usr/bin、/bin 也要保留。可以用 $PATH 引用原来的值。";
  else if (!nodeRow.now && result.rows.find((row) => row.id === "libctl")!.now) message = "libctl 找到了，node 还是旧版：shell 从左往右查 PATH，用的是第一个找到的。";
  else if (!result.passed) message = `还没完成：${goals.filter((goal) => !goal.ok).map((goal) => goal.label).join("；")}。`;
  return { passed: result.passed, goals, message };
}

// ---------------------------------------------------------------------------
// Ch9 · 3 a.m.: the disk is full
// ---------------------------------------------------------------------------

export function gradeDisk(m: Machine): Graded {
  const percent = diskPercent(m);
  const web = m.services["library-web"]!;
  const healthy = web.state === "active" && m.procs.some((proc) => proc.port === 80) && percent < 99;
  const backups = BACKUPS.filter((name) => m.fs[`/home/ops/backups/${name}`]);
  const logs = KEEP_LOGS.filter((path) => m.fs[path]);
  const goals: Goal[] = [
    { id: "space", label: "磁盘使用率降到 80% 以下", ok: percent < 80, detail: `现在是 ${percent}%` },
    { id: "site", label: "网站恢复正常（curl 返回 200）", ok: healthy },
    { id: "backup", label: "最近一次的备份还在", ok: backups.includes(BACKUPS[BACKUPS.length - 1]!) },
    { id: "logs", label: "排查要用的 access.log 和 error.log 还在", ok: logs.length === KEEP_LOGS.length },
  ];
  const missing = failed(goals);
  let message = "磁盘空出来了，网站也恢复了。别忘了告诉开发：web.conf 里的 log_level 还是 debug，过几天还会写满。";
  if (percent >= 80 && m.unlinked.some((item) => item.path === DEBUG_LOG)) {
    message = "debug.log 已经删掉了，可磁盘还是满的：网站进程还开着这个文件，空间要等它关掉文件才会释放。";
  } else if (missing.length) message = `还没完成：${missing.map((goal) => goal.label).join("；")}。`;
  return { passed: missing.length === 0, goals, message };
}

// ---------------------------------------------------------------------------
// Terminal labs: which machine each one starts from
// ---------------------------------------------------------------------------

export const MACHINES = {
  paths: pathsMachine,
  files: filesMachine,
  logs: logsMachine,
  pipes: pipesMachine,
  processes: processMachine,
  env: () => envMachine(envFs()),
  disk: diskMachine,
} as const;

export type MachineId = keyof typeof MACHINES;

export function replayLab(id: MachineId, history: readonly string[]) {
  return replay(MACHINES[id], history);
}

/** Bounds-checked command history from untrusted input, or null. */
export function parseHistory(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > HISTORY_MAX) return null;
  const history: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > COMMAND_MAX) return null;
    history.push(item);
  }
  return history;
}
