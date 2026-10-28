/**
 * The machine behind library.test, as the on-call admin `ops` sees it after
 * logging in. Each lab starts from one moment in this server's life; the
 * layout, users and services are the same in every chapter.
 */
import {
  type Entry,
  type Fs,
  type Machine,
  type Proc,
  type Result,
  type Service,
  type User,
  USERS,
  diskPercent,
  fillDisk,
  join,
  runLine,
  spawn,
} from "./shell";

const TIME = "Oct 27 07:00";
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

type Options = Partial<Pick<Entry, "owner" | "group" | "mode" | "size" | "program" | "time">>;

function dir(fs: Fs, path: string, owner: User = "root", group = owner as string, mode = 0o755): void {
  fs[path] = { type: "dir", owner, group, mode, content: "", time: TIME };
}

function file(fs: Fs, path: string, content: string, options: Options = {}): void {
  fs[path] = {
    type: "file",
    owner: options.owner ?? "root",
    group: options.group ?? options.owner ?? "root",
    mode: options.mode ?? 0o644,
    content,
    size: options.size,
    program: options.program,
    time: options.time ?? TIME,
  };
}

const BIN = ["ls", "cat", "cp", "mv", "rm", "mkdir", "rmdir", "touch", "chmod", "grep", "pwd", "echo", "bash"];
const USR_BIN = ["head", "tail", "wc", "sort", "uniq", "cut", "awk", "find", "du", "df", "ps", "ss", "which", "env", "printenv", "whoami", "id", "hostname", "date", "systemctl", "curl", "truncate", "sudo", "git"];

export const BASHRC = `# ~/.bashrc：每次登录时自动运行
alias ll='ls -l'
export EDITOR=nano
`;

/** Everything every chapter shares: system directories, users' homes, the site. */
export function baseFs(): Fs {
  const fs: Fs = {};
  dir(fs, "/");
  for (const path of ["/bin", "/usr", "/usr/bin", "/usr/local", "/usr/local/bin", "/etc", "/opt", "/var", "/var/log", "/var/lib", "/var/www", "/home", "/srv", "/dev"]) dir(fs, path);
  dir(fs, "/root", "root", "root", 0o700);
  dir(fs, "/tmp", "root", "root", 0o777);
  file(fs, "/dev/null", "", { mode: 0o666 });
  BIN.forEach((name, index) => file(fs, `/bin/${name}`, "", { mode: 0o755, size: 35_000 + index * 4_096, program: name }));
  USR_BIN.forEach((name, index) => file(fs, `/usr/bin/${name}`, "", { mode: 0o755, size: 22_000 + index * 3_072, program: name }));

  file(fs, "/etc/hostname", "library\n");
  file(
    fs,
    "/etc/passwd",
    [
      "root:x:0:0:root:/root:/bin/bash",
      "www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin",
      "postgres:x:112:112:PostgreSQL:/var/lib/postgresql:/bin/bash",
      "ops:x:1001:1001:值班运维:/home/ops:/bin/bash",
      "deploy:x:1002:1002:部署账号:/home/deploy:/bin/bash",
      "guest:x:1003:1003:实习生:/home/guest:/bin/bash",
      "",
    ].join("\n"),
  );
  file(fs, "/etc/group", ["root:x:0:", "www-data:x:33:", "ops:x:1001:", "deploy:x:1002:", "guest:x:1003:", "web:x:1010:ops,www-data", ""].join("\n"));
  file(fs, "/etc/shadow", "root:$y$j9T$…:20380:0:99999:7:::\n", { group: "shadow", mode: 0o640 });
  dir(fs, "/etc/library");
  file(fs, "/etc/library/web.conf", "listen = 0.0.0.0:80\nroot = /srv/library/static\nlog_dir = /var/log/library\nlog_level = info\n");

  dir(fs, "/home/ops", "ops", "ops", 0o750);
  file(fs, "/home/ops/.bashrc", BASHRC, { owner: "ops" });
  file(fs, "/home/ops/notes.txt", "值班笔记\n- 网站目录：/srv/library\n- 日志：/var/log/library\n- 重启网站：sudo systemctl restart library-web\n", { owner: "ops" });
  dir(fs, "/home/deploy", "deploy", "deploy", 0o755);
  dir(fs, "/home/deploy/logs", "deploy", "deploy", 0o755);
  file(fs, "/home/deploy/logs/deploy.log", "2026-10-26 03:00:01 deploy finished: release 2026-10-26\n", { owner: "deploy" });
  dir(fs, "/home/guest", "guest", "guest", 0o750);

  dir(fs, "/srv/library", "ops", "web", 0o755);
  dir(fs, "/srv/library/bin", "ops", "web", 0o755);
  file(fs, "/srv/library/bin/deploy.sh", "#!/bin/bash\n# 读取 /srv/library/deploy.conf，把新版本发布到 releases/current\n", { owner: "ops", group: "web", mode: 0o755 });
  dir(fs, "/srv/library/static", "ops", "web", 0o755);
  file(fs, "/srv/library/static/index.html", "<!doctype html>\n<title>library.test</title>\n<h1>小城图书馆</h1>\n", { owner: "ops", group: "web" });
  file(fs, "/srv/library/static/style.css", "body { font-family: sans-serif; }\n", { owner: "ops", group: "web" });
  dir(fs, "/srv/library/uploads", "ops", "web", 0o775);
  dir(fs, "/srv/library/config", "ops", "web", 0o750);
  file(fs, "/srv/library/config/db.env", "DATABASE_URL=postgres://library:Lib-2026-Pw@127.0.0.1:5432/library\n", { owner: "ops", group: "web", mode: 0o640 });
  dir(fs, "/srv/library/releases", "ops", "web", 0o755);
  for (const release of ["2026-10-20", "2026-10-26", "current"]) {
    dir(fs, `/srv/library/releases/${release}`, "ops", "web", 0o755);
    file(fs, `/srv/library/releases/${release}/library-web`, "", { owner: "ops", group: "web", mode: 0o755, size: 18 * MiB, program: "library-web" });
  }
  file(fs, "/srv/library/deploy.conf", DEPLOY_CONF, { owner: "ops", group: "web" });
  dir(fs, "/srv/shared", "ops", "web", 0o755);
  dir(fs, "/srv/shared/uploads", "ops", "web", 0o775);

  dir(fs, "/var/log/library", "www-data", "web", 0o770);
  file(fs, "/var/log/library/access.log", ACCESS_LOG.text, { owner: "www-data", group: "web", mode: 0o640 });
  file(fs, "/var/log/library/error.log", ERROR_LOG, { owner: "www-data", group: "web", mode: 0o640 });
  dir(fs, "/var/lib/postgresql", "postgres", "postgres", 0o700);
  dir(fs, "/var/lib/postgresql/16", "postgres", "postgres", 0o700);
  dir(fs, "/var/lib/postgresql/16/main", "postgres", "postgres", 0o700);
  file(fs, "/var/lib/postgresql/16/main/base.dat", "", { owner: "postgres", mode: 0o600, size: Math.round(1.6 * GiB) });
  return fs;
}

export const DEPLOY_CONF = `# 部署脚本 bin/deploy.sh 读取的设置
static  = static
uploads = ../shared/uploads
release = release/current
logs    = ~/logs
`;

// ---------------------------------------------------------------------------
// Logs (shared by the log and pipe chapters)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");

const VISITORS: [string, number][] = [
  ["203.0.113.7", 412],
  ["198.51.100.23", 389],
  ["192.0.2.140", 377],
  ["203.0.113.58", 201],
  ["198.51.100.4", 163],
  ["192.0.2.101", 48],
  ["192.0.2.12", 46],
  ["203.0.113.19", 44],
  ["198.51.100.77", 43],
  ["192.0.2.33", 41],
  ["203.0.113.250", 40],
  ["198.51.100.150", 39],
  ["192.0.2.8", 38],
  ["203.0.113.91", 37],
  ["198.51.100.61", 36],
  ["192.0.2.200", 35],
  ["203.0.113.120", 34],
  ["198.51.100.9", 33],
];

export const FIRST_ERROR_SECONDS = 7 * 3600 + 42 * 60 + 13;

type LogLine = { ip: string; time: string; method: string; path: string; status: number; size: number };

function generateLog(): { text: string; rows: LogLine[] } {
  const random = mulberry32(20261027);
  const ips = VISITORS.flatMap(([ip, count]) => Array.from({ length: count }, () => ip));
  for (let index = ips.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [ips[index], ips[swap]] = [ips[swap]!, ips[index]!];
  }
  const step = 34_180 / ips.length;
  const seconds = ips.map((_, index) => Math.floor(5 + index * step + random() * 10));
  const firstError = seconds.findIndex((value) => value >= FIRST_ERROR_SECONDS);
  seconds[firstError] = FIRST_ERROR_SECONDS;

  const rows = ips.map((ip, index): LogLine => {
    const roll = random();
    let method = "GET";
    let path: string;
    let status = 200;
    let size = 300 + Math.floor(random() * 8_700);
    if (roll < 0.15) path = "/";
    else if (roll < 0.3) path = "/books";
    else if (roll < 0.5) path = `/books/${1 + Math.floor(random() * 480)}`;
    else if (roll < 0.6) path = `/api/books?page=${1 + Math.floor(random() * 9)}`;
    else if (roll < 0.7) path = "/static/style.css";
    else if (roll < 0.78) path = "/static/app.js";
    else if (roll < 0.83) {
      path = "/favicon.ico";
      status = 404;
      size = 162;
    } else if (roll < 0.88) {
      path = "/api/ping";
      size = 500;
    } else if (roll < 0.95) {
      method = "POST";
      path = "/api/loans";
    } else path = "/api/holds";
    if (path.startsWith("/static/") && random() < 0.4) {
      status = 304;
      size = 0;
    }
    if (index > firstError && (path === "/api/loans" || path === "/api/holds") && random() < 0.65) {
      status = 500;
      size = 187;
    }
    if (size === 500 && path !== "/api/ping") size = 501;
    return { ip, time: clock(seconds[index]!), method, path, status, size };
  });
  rows[firstError] = { ...rows[firstError]!, method: "POST", path: "/api/loans", status: 500, size: 187 };
  for (const index of [37, 912, 1650]) rows[index] = { ...rows[index]!, method: "GET", path: "/books/500", status: 200, size: 4_210 };
  const text = rows.map((row) => `${row.ip} - - [27/Oct/2026:${row.time} +0800] "${row.method} ${row.path} HTTP/1.1" ${row.status} ${row.size}`).join("\n") + "\n";
  return { text, rows };
}

export const ACCESS_LOG = generateLog();

export const ERROR_LOG = [
  "2026/10/27 02:00:01 [notice] log rotation finished",
  "2026/10/27 05:10:44 [error] smtp: certificate for mail.library.test expires in 3 days",
  "2026/10/27 06:00:00 [warn] disk usage at 71%",
  "2026/10/27 06:30:12 [warn] slow query: 1.4s SELECT * FROM books WHERE title LIKE '%史%'",
  ...ACCESS_LOG.rows
    .filter((row) => row.status === 500)
    .map((row) => `2026/10/27 ${row.time} [error] ${row.method} ${row.path}: database: sorry, too many clients already (max_connections=20)`),
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------

function baseProcs(): Proc[] {
  return [
    { pid: 1, user: "root", name: "systemd", command: "/sbin/init", start: "Oct20", cpu: "0.0", mem: "0.3", holds: [] },
    { pid: 402, user: "postgres", name: "postgres", command: "/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main", start: "Oct20", cpu: "1.2", mem: "6.4", port: 5432, holds: [], service: "postgresql" },
    { pid: 640, user: "root", name: "sshd", command: "sshd: /usr/sbin/sshd -D", start: "Oct20", cpu: "0.0", mem: "0.2", port: 22, holds: [] },
  ];
}

const WEB_COMMAND = "/srv/library/releases/current/library-web --port 80";

function webProc(pid: number, extraHolds: string[] = []): Proc {
  return { pid, user: "www-data", name: "library-web", command: WEB_COMMAND, start: "Oct26", cpu: "3.1", mem: "4.2", port: 80, holds: ["/var/log/library/access.log", ...extraHolds], service: "library-web" };
}

function services(webPid: number | undefined, webState: Service["state"] = "active"): Record<string, Service> {
  return {
    "library-web": { state: webState, pid: webPid, description: "library.test website", log: [] },
    postgresql: { state: "active", pid: 402, description: "PostgreSQL database", log: [] },
  };
}

function defaultHooks(): Machine["hooks"] {
  return {
    startService(m, name) {
      if (name === "postgresql") {
        spawn(m, { ...baseProcs()[1]!, start: m.clock.slice(-5) });
        m.services.postgresql!.pid = m.procs[m.procs.length - 1]!.pid;
        return null;
      }
      if (m.procs.some((proc) => proc.port === 80)) return "listen tcp 0.0.0.0:80: bind: address already in use";
      const holds = ["/var/log/library/access.log"];
      const proc = spawn(m, { ...webProc(0), start: m.clock.slice(-5), cpu: "0.4", mem: "1.1", holds });
      m.services["library-web"]!.pid = proc.pid;
      return null;
    },
    program(m, program, args) {
      return runProgram(m, program, args);
    },
  };
}

function runProgram(m: Machine, program: string, args: string[]): Result | null {
  const out = (text: string): Result => ({ out: text, err: "", code: 0 });
  if (program === "node12" || program === "node20") {
    if (args[0] === "--version" || args[0] === "-v") return out(program === "node12" ? "v12.22.12\n" : "v20.18.0\n");
    return { out: "", err: "node：这里只能运行 node --version\n", code: 1 };
  }
  if (program === "libctl") {
    if (args[0] === "--version") return out("libctl 2.1.0\n");
    if (args[0] === "status") {
      const web = m.services["library-web"];
      return out(`library-web   ${web?.state ?? "unknown"}\npostgresql    ${m.services.postgresql?.state ?? "unknown"}\ndisk          ${diskPercent(m)}% used\n`);
    }
    return out("用法：libctl status | libctl --version\n");
  }
  if (program === "library-web") {
    return { out: "", err: "（不要手动启动网站：请用 sudo systemctl start library-web。手动启动的进程没人管，昨晚的问题就是这么来的。）\n", code: 1 };
  }
  return null;
}

type Setup = { fs: Fs; cwd: string; clock?: string; procs?: Proc[]; services?: Record<string, Service>; percent?: number; nextPid?: number };

/** Logs `ops` in: default environment, then ~/.bashrc, then `cd` to the lab's directory. */
export function createMachine(setup: Setup): Machine {
  const home = USERS.ops.home;
  const m: Machine = {
    fs: setup.fs,
    cwd: home,
    oldCwd: home,
    user: "ops",
    hostname: "library",
    clock: setup.clock ?? "Oct 27 08:05",
    env: { HOME: home, USER: "ops", SHELL: "/bin/bash", LANG: "C.UTF-8", PATH: "/usr/local/bin:/usr/bin:/bin", PWD: home },
    aliases: {},
    procs: setup.procs ?? [...baseProcs(), webProc(1490)],
    nextPid: setup.nextPid ?? 2301,
    services: setup.services ?? services(1490),
    disk: { total: 20 * GiB, base: 0 },
    unlinked: [],
    events: [],
    lastCode: 0,
    hooks: defaultHooks(),
  };
  fillDisk(m, setup.percent ?? 41);
  if (m.fs[join(home, ".bashrc")]) runLine(m, "source ~/.bashrc");
  m.cwd = setup.cwd;
  m.oldCwd = setup.cwd;
  m.env.PWD = setup.cwd;
  m.lastCode = 0;
  return m;
}

/** A copy of the file tree, so a "next login" check cannot change the machine it inspects. */
export function cloneFs(fs: Fs): Fs {
  return Object.fromEntries(Object.entries(fs).map(([key, entry]) => [key, { ...entry }]));
}

// Ch2 · paths ----------------------------------------------------------------

export function pathsMachine(): Machine {
  return createMachine({ fs: baseFs(), cwd: "/srv/library" });
}

// Ch3 · tidy the upload inbox -------------------------------------------------

export const INBOX_FILES: { path: string; content: string; kind: "image" | "doc" | "tmp" | "keep" }[] = [
  { path: "cover-001.jpg", content: "JPEG 图片：《三体》封面\n", kind: "image" },
  { path: "cover-002.jpg", content: "JPEG 图片：《活着》封面\n", kind: "image" },
  { path: "banner.png", content: "PNG 图片：读书月横幅\n", kind: "image" },
  { path: "report.pdf", content: "PDF：2026 年度借阅报告（最新版）\n", kind: "doc" },
  { path: "manual.pdf", content: "PDF：自助借还机使用手册\n", kind: "doc" },
  { path: "old/report.pdf", content: "PDF：2025 年度借阅报告（去年的，档案要留）\n", kind: "doc" },
  { path: "upload-7f3a.tmp", content: "上传到一半的临时文件\n", kind: "tmp" },
  { path: "upload-91c2.tmp", content: "上传到一半的临时文件\n", kind: "tmp" },
  { path: "old/upload-1c0e.tmp", content: "上传到一半的临时文件\n", kind: "tmp" },
  { path: ".htaccess", content: "# 禁止直接执行上传的文件\nOptions -ExecCGI\n", kind: "keep" },
];

export const UPLOADS = "/srv/library/uploads";
export const INBOX = `${UPLOADS}/inbox`;

export function filesMachine(): Machine {
  const fs = baseFs();
  dir(fs, INBOX, "ops", "web", 0o775);
  dir(fs, `${INBOX}/old`, "ops", "web", 0o775);
  for (const item of INBOX_FILES) file(fs, `${INBOX}/${item.path}`, item.content, { owner: "ops", group: "web", time: "Oct 26 18:20" });
  return createMachine({ fs, cwd: UPLOADS });
}

// Ch4 · read the logs ---------------------------------------------------------

export function logsMachine(): Machine {
  return createMachine({ fs: baseFs(), cwd: "/var/log/library", clock: "Oct 27 09:31" });
}

// Ch5 · pipes ---------------------------------------------------------------

export const REPORT_PATH = "/home/ops/weekly-report.txt";
export const REPORT_ORIGINAL = `# library.test 运维周报（10 月第 4 周）

## 本周事件
- 10/23 证书续期完成
- 10/25 上传目录整理完毕
- 10/27 07:42 起借书接口报 500，原因是数据库连接数用完，已调大连接池

## 今天访问次数最多的 3 个 IP
`;

export function pipesMachine(): Machine {
  const fs = baseFs();
  file(fs, REPORT_PATH, REPORT_ORIGINAL, { owner: "ops" });
  return createMachine({ fs, cwd: "/home/ops", clock: "Oct 27 09:40" });
}

// Ch7 · processes -------------------------------------------------------------

export const OLD_WEB_PID = 812;
export const WORKER_PID = 813;
export const INCOMING = `${UPLOADS}/incoming`;
export const IN_FLIGHT = ["scan-0091.pdf", "scan-0092.pdf"];

export function processMachine(): Machine {
  const fs = baseFs();
  dir(fs, INCOMING, "ops", "web", 0o775);
  for (const name of IN_FLIGHT) file(fs, `${INCOMING}/${name}.part`, `PDF：${name} 的前半部分……\n`, { owner: "ops", group: "web", time: "Oct 27 08:04" });
  const old: Proc = {
    pid: OLD_WEB_PID,
    user: "ops",
    name: "library-web",
    command: "/srv/library/releases/2026-10-20/library-web --port 80",
    start: "Oct26",
    cpu: "2.8",
    mem: "3.9",
    port: 80,
    holds: ["/var/log/library/access.log", ...IN_FLIGHT.map((name) => `${INCOMING}/${name}.part`)],
  };
  const worker: Proc = { pid: WORKER_PID, user: "ops", name: "library-worker", command: "/srv/library/releases/2026-10-20/library-worker --queue mail", start: "Oct26", cpu: "0.6", mem: "1.8", holds: [] };
  const allServices = services(undefined, "failed");
  allServices["library-web"]!.log = [
    "Oct 27 07:55 systemd[1]: Starting library-web.service - library.test website...",
    "Oct 27 07:55 library-web[1484]: release 1.4.0 (2026-10-27)",
    "Oct 27 07:55 library-web[1484]: listen tcp 0.0.0.0:80: bind: address already in use",
    "Oct 27 07:55 systemd[1]: library-web.service: Main process exited, code=exited, status=1/FAILURE",
    "Oct 27 07:55 systemd[1]: Failed to start library-web.service.",
  ];
  const m = createMachine({ fs, cwd: "/home/ops", procs: [...baseProcs(), old, worker], services: allServices });
  const hooks = m.hooks;
  m.hooks = {
    ...hooks,
    signal(machine, proc, signal) {
      if (signal === "HUP") return false;
      if (proc.pid === OLD_WEB_PID && signal !== "KILL") {
        for (const name of IN_FLIGHT) {
          const part = `${INCOMING}/${name}.part`;
          if (!machine.fs[part]) continue;
          machine.fs[`${INCOMING}/${name}`] = { ...machine.fs[part]!, content: `PDF：${name}（完整）\n`, time: machine.clock };
          delete machine.fs[part];
        }
      }
      return true;
    },
    curl(machine) {
      const proc = machine.procs.find((item) => item.port === 80);
      const version = proc?.pid === OLD_WEB_PID ? "1.3.0" : "1.4.0";
      return { status: 200, headers: ["Content-Type: text/html", `X-Library-Version: ${version}`], body: `<h1>小城图书馆</h1> <!-- version ${version} -->\n` };
    },
  };
  return m;
}

// Ch8 · PATH ---------------------------------------------------------------

export function envFs(): Fs {
  const fs = baseFs();
  file(fs, "/usr/bin/node", "", { mode: 0o755, size: 41 * MiB, program: "node12" });
  for (const path of ["/opt/node20", "/opt/node20/bin", "/opt/libctl", "/opt/libctl/bin"]) dir(fs, path);
  file(fs, "/opt/node20/bin/node", "", { mode: 0o755, size: 96 * MiB, program: "node20" });
  file(fs, "/opt/node20/bin/npm", "", { mode: 0o755, size: 4_096 });
  file(fs, "/opt/libctl/bin/libctl", "", { mode: 0o755, size: 7 * MiB, program: "libctl" });
  file(fs, "/opt/libctl/README.txt", "libctl：library.test 的运维小工具。\n安装位置：/opt/libctl/bin/libctl\n", {});
  return fs;
}

export function envMachine(fs = envFs()): Machine {
  return createMachine({ fs, cwd: "/home/ops", clock: "Oct 27 10:15" });
}

// Ch9 · the disk is full ----------------------------------------------------

export const DEBUG_LOG = "/var/log/library/debug.log";
export const BACKUPS = ["library-2026-10-24.tar.gz", "library-2026-10-25.tar.gz", "library-2026-10-26.tar.gz"];
export const KEEP_LOGS = ["/var/log/library/access.log", "/var/log/library/error.log"];

export function diskMachine(): Machine {
  const fs = baseFs();
  file(
    fs,
    DEBUG_LOG,
    "2026/10/27 03:11:58 [debug] cache hit key=book:42 took=0.2ms\n2026/10/27 03:11:58 [debug] cache hit key=book:43 took=0.2ms\n2026/10/27 03:11:59 [debug] write: no space left on device\n",
    { owner: "www-data", group: "web", mode: 0o660, size: Math.round(15.2 * GiB), time: "Oct 27 03:12" },
  );
  fs["/etc/library/web.conf"] = { ...fs["/etc/library/web.conf"]!, content: fs["/etc/library/web.conf"]!.content.replace("log_level = info", "log_level = debug   # 10/20 排查问题时临时打开") };
  dir(fs, "/home/ops/backups", "ops", "ops", 0o755);
  for (const name of BACKUPS) file(fs, `/home/ops/backups/${name}`, "", { owner: "ops", size: Math.round(0.41 * GiB), time: `Oct ${name.slice(16, 18)} 02:00` });
  file(fs, "/tmp/upload-5c1d.tmp", "", { owner: "www-data", group: "www-data", size: 12 * MiB });
  fs["/var/log/library/error.log"] = {
    ...fs["/var/log/library/error.log"]!,
    content: `${fs["/var/log/library/error.log"]!.content}2026/10/27 03:12:04 [crit] write ${UPLOADS}/incoming/scan-0107.pdf: no space left on device\n2026/10/27 03:12:09 [crit] session store: no space left on device\n`,
  };
  const web = webProc(1490, [DEBUG_LOG]);
  const all = services(1490);
  all["library-web"]!.log = ["Oct 27 03:12 library-web[1490]: write /var/log/library/debug.log: no space left on device", "Oct 27 03:12 library-web[1490]: session store: no space left on device"];
  const m = createMachine({ fs, cwd: "/home/ops", clock: "Oct 27 03:20", procs: [...baseProcs(), web], services: all, percent: 100 });
  const hooks = m.hooks;
  m.hooks = {
    ...hooks,
    startService(machine, name) {
      const problem = hooks.startService!(machine, name);
      if (problem || name !== "library-web") return problem;
      const proc = machine.procs.find((item) => item.pid === machine.services["library-web"]!.pid)!;
      if (!machine.fs[DEBUG_LOG]) file(machine.fs, DEBUG_LOG, "", { owner: "www-data", group: "web", mode: 0o660, time: machine.clock });
      proc.holds.push(DEBUG_LOG);
      return null;
    },
    curl(machine) {
      if (diskPercent(machine) >= 99) return { status: 500, headers: ["Content-Type: text/plain"], body: "500 Internal Server Error: no space left on device\n" };
      return { status: 200, headers: ["Content-Type: text/html"], body: "<h1>小城图书馆</h1>\n" };
    },
  };
  return m;
}
