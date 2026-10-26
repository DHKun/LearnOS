/**
 * Lab definitions and grading rules. Components use them for live feedback;
 * validators.ts re-runs the same rules on the server, which alone decides
 * whether a block is passed.
 */
import type { LabRequest, Method } from "./http";
import { INITIAL_BOOKS, browserSend, createWorld, publicBook, replay } from "./library";

function bodyJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export const JSON_ACCEPT = { name: "Accept", value: "application/json" };

export function getRequest(url: string): LabRequest {
  return { method: "GET", url, headers: [JSON_ACCEPT], body: "" };
}

// ---------------------------------------------------------------------------
// Ch2 URL lab: two broken shared links.
// ---------------------------------------------------------------------------

export const URL_TASKS = [
  {
    id: "page",
    ticket: "读者分享了一个「图书列表第 2 页」的链接，可别人打开总是第 1 页。",
    initial: "https://library.test/api/books#page=2",
    goal: "让服务器返回图书列表的第 2 页",
  },
  {
    id: "port",
    ticket: "有人从旧文档里复制了搜索链接，浏览器提示无法连接。",
    initial: "https://library.test:8080/api/books?q=实战",
    goal: "成功搜索书名包含「实战」的图书",
  },
] as const;
export type UrlTaskId = (typeof URL_TASKS)[number]["id"];

export function gradeUrlTask(id: UrlTaskId, url: string): { passed: boolean; message: string } {
  const result = browserSend(createWorld(), getRequest(url));
  if (result.error) return { passed: false, message: result.error.note };
  if (!result.response || result.response.status !== 200 || !result.wire) {
    return { passed: false, message: `服务器返回了 ${result.response?.status ?? "错误"}，还没拿到想要的数据。` };
  }
  const target = new URL(result.wire.target, "https://library.test");
  if (target.pathname !== "/api/books") return { passed: false, message: "请求的不是图书列表 /api/books。" };
  const data = bodyJson(result.response.body);
  if (id === "page") {
    return data?.page === 2
      ? { passed: true, message: "服务器收到了 page=2：查询参数会进请求行，片段不会。" }
      : { passed: false, message: `服务器返回的是第 ${String(data?.page ?? 1)} 页。看看请求行里到底有没有 page 参数。` };
  }
  const items = Array.isArray(data?.items) ? (data.items as { title?: string }[]) : [];
  return data?.q === "实战" && items.length > 0
    ? { passed: true, message: "连上了默认的 443 端口，搜索也成功了。注意请求行里的中文被百分号编码了。" }
    : { passed: false, message: "连接成功了，但搜索条件不是「实战」。" };
}

// ---------------------------------------------------------------------------
// Ch3 request lab: the detail page asks for a book by title instead of id.
// ---------------------------------------------------------------------------

export const REQUEST_LAB = {
  ticket: "图书详情页《HTTP 从入门到排错》一直显示「找不到这本书」。",
  /** What the broken page sent. */
  broken: getRequest("/api/books/HTTP%20从入门到排错"),
  targetTitle: "HTTP 从入门到排错",
};

export function gradeRequestLab(request: LabRequest): { passed: boolean; message: string } {
  const result = browserSend(createWorld(), request);
  if (result.error) return { passed: false, message: result.error.note };
  const response = result.response!;
  const data = bodyJson(response.body);
  if (request.method === "GET" && response.status === 200 && data?.title === REQUEST_LAB.targetTitle && data?.id !== undefined) {
    return { passed: true, message: `找到了：这本书的 ID 是 ${String(data.id)}，详情接口要的是 ID 而不是书名。` };
  }
  if (response.status === 200 && Array.isArray(data?.items)) {
    return { passed: false, message: "列表查到了，接下来用列表里的 id 去请求那本书的详情。" };
  }
  return { passed: false, message: `目前得到 ${response.status} ${response.reason}。目标是用 GET 读到《${REQUEST_LAB.targetTitle}》的详情。` };
}

// ---------------------------------------------------------------------------
// Ch4 response lab: read five responses and answer from what they say.
// ---------------------------------------------------------------------------

export const RESPONSE_CASES = [
  {
    id: "created",
    context: "读者提交了一条留言：",
    raw: 'HTTP/1.1 201 Created\nContent-Type: application/json; charset=utf-8\nLocation: /api/notes/42\n\n{"id":42,"title":"周末读完第三章"}',
    question: "以后想再读取这条留言，应该请求哪个路径？",
    kind: "text",
  },
  {
    id: "moved",
    context: "浏览器请求了旧书目地址 /old-catalog：",
    raw: "HTTP/1.1 301 Moved Permanently\nLocation: https://library.test/api/books?page=1\nContent-Length: 0\n",
    question: "浏览器接下来会自动请求哪个地址？",
    kind: "text",
  },
  {
    id: "allow",
    context: "前端对 /api/books/2 发了 POST：",
    raw: 'HTTP/1.1 405 Method Not Allowed\nAllow: GET, HEAD, PUT, PATCH, DELETE\nContent-Type: application/json; charset=utf-8\n\n{"error":"method_not_allowed"}',
    question: "这个资源支持哪些方法？（多选）",
    kind: "methods",
  },
  {
    id: "retry",
    context: "高峰期借书接口返回：",
    raw: 'HTTP/1.1 503 Service Unavailable\nRetry-After: 120\nContent-Type: application/json; charset=utf-8\n\n{"error":"busy"}',
    question: "客户端至少应该等待多少秒再重试？",
    kind: "number",
  },
  {
    id: "html",
    context: "前端调用 /api/loans 后执行 response.json()，却抛出 SyntaxError：",
    raw: 'HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\n\n<!doctype html>\n<title>请先登录</title>\n<form action="/login">…</form>',
    question: "最可能的原因是什么？",
    kind: "choice",
    options: [
      { id: "html", label: "服务器给的是一张 HTML 登录页，不是 JSON" },
      { id: "status", label: "状态码 200 表示请求失败" },
      { id: "broken", label: "服务器返回的 JSON 少了一个逗号" },
    ],
  },
] as const;
export type ResponseCaseId = (typeof RESPONSE_CASES)[number]["id"];
export type ResponseAnswers = Partial<Record<ResponseCaseId, string | string[]>>;

function normalizePath(value: string): string {
  return value.trim().replace(/^https:\/\/library\.test/i, "") || "/";
}

export function gradeResponseCase(id: ResponseCaseId, answer: string | string[] | undefined): boolean {
  if (answer === undefined) return false;
  switch (id) {
    case "created":
      return typeof answer === "string" && normalizePath(answer) === "/api/notes/42";
    case "moved":
      return typeof answer === "string" && normalizePath(answer) === "/api/books?page=1";
    case "allow": {
      if (!Array.isArray(answer)) return false;
      const expected = ["DELETE", "GET", "HEAD", "PATCH", "PUT"];
      return [...new Set(answer)].sort().join(",") === expected.join(",");
    }
    case "retry":
      return typeof answer === "string" && Number(answer.trim()) === 120;
    case "html":
      return answer === "html";
  }
}

export function gradeResponseLab(answers: ResponseAnswers) {
  const results = RESPONSE_CASES.map((item) => gradeResponseCase(item.id, answers[item.id]));
  return { results, correct: results.filter(Boolean).length, total: results.length, passed: results.every(Boolean) };
}

// ---------------------------------------------------------------------------
// Ch5 method lab: fix book 7's title without damaging anything else.
// ---------------------------------------------------------------------------

export const METHOD_LAB = {
  ticket: "7 号书的书名录错了：「TCP/IP 漫游指男」应为「TCP/IP 漫游指南」。请修正它，其他信息不能动。",
  bookId: 7,
  fixedTitle: "TCP/IP 漫游指南",
  as: "librarian",
};

export function gradeMethodLab(history: LabRequest[]): { passed: boolean; message: string } {
  if (history.length === 0) return { passed: false, message: "还没有发送任何请求。" };
  const { world } = replay(history, { as: METHOD_LAB.as });
  const original = INITIAL_BOOKS.find((book) => book.id === METHOD_LAB.bookId)!;
  const current = world.books.find((book) => book.id === METHOD_LAB.bookId);
  if (!current) return { passed: false, message: "7 号书被删除了。修正书名不需要删除资源——重置后再试。" };
  const expected = { ...publicBook(original), title: METHOD_LAB.fixedTitle };
  const actual = publicBook(current);
  const lost = (["author", "year", "available"] as const).filter((field) => actual[field] !== expected[field]);
  if (actual.title !== METHOD_LAB.fixedTitle) {
    return { passed: false, message: `7 号书现在的书名是「${actual.title ?? "（空）"}」，还没有改成「${METHOD_LAB.fixedTitle}」。` };
  }
  if (lost.length) {
    return {
      passed: false,
      message: `书名对了，但 ${lost.join("、")} 和原来不一样。如果用的是 PUT，它会用你发送的内容整体替换资源。`,
    };
  }
  const others = world.books.filter((book) => book.id !== METHOD_LAB.bookId);
  const othersOk =
    others.length === INITIAL_BOOKS.length - 1 &&
    others.every((book) => JSON.stringify(publicBook(book)) === JSON.stringify(publicBook(INITIAL_BOOKS.find((item) => item.id === book.id)!)));
  if (!othersOk) return { passed: false, message: "7 号书改好了，但其他图书也被改动了。重置后只修改 7 号。" };
  return { passed: true, message: "修正完成，其余字段原样保留。" };
}

// ---------------------------------------------------------------------------
// Ch6 JSON lab: the note form sends three things wrong.
// ---------------------------------------------------------------------------

export const JSON_LAB = {
  ticket: "读者反馈：留言板的「发表」按钮点了没反应。下面是前端实际发出的请求。",
  broken: {
    method: "POST" as Method,
    url: "/api/notes",
    headers: [
      { name: "Accept", value: "text/html" },
      { name: "Content-Type", value: "text/plain" },
    ],
    body: "{title: '周末读完第三章'}",
  } satisfies LabRequest,
};

export function gradeJsonLab(request: LabRequest): { passed: boolean; message: string; status?: number } {
  const result = browserSend(createWorld(), request);
  if (result.error) return { passed: false, message: result.error.note };
  const response = result.response!;
  const created = request.method === "POST" && new URL(request.url, "https://library.test").pathname === "/api/notes" && response.status === 201;
  return created
    ? { passed: true, status: 201, message: "201 Created：Accept、Content-Type 和 JSON 正文都对了。" }
    : { passed: false, status: response.status, message: `还是 ${response.status} ${response.reason}：${response.note}` };
}

// ---------------------------------------------------------------------------
// Ch7 cookie lab: configure Set-Cookie so five real situations behave.
// ---------------------------------------------------------------------------

export type CookieConfig = {
  path: "/" | "/account" | "/api";
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export const COOKIE_PATHS: CookieConfig["path"][] = ["/", "/account", "/api"];
export const COOKIE_INITIAL: CookieConfig = { path: "/account", secure: false, httpOnly: false, sameSite: "Strict" };

export const COOKIE_SCENARIOS = [
  {
    id: "own",
    title: "在本站打开「我的借阅」",
    detail: "地址栏 https://library.test/account/loans，页面脚本再请求 /api/loans 取数据。",
    want: "两个请求都带上会话，页面正常显示。",
  },
  {
    id: "email",
    title: "从邮件里的链接点进来",
    detail: "在 mail.example 上点击链接，顶层跳转到 https://library.test/account/loans。",
    want: "读者仍然是登录状态。",
  },
  {
    id: "csrf",
    title: "恶意网站偷偷提交表单",
    detail: "evil.example 上的页面自动 POST 到 https://library.test/api/loans。",
    want: "这个跨站 POST 不应带上会话。",
  },
  {
    id: "xss",
    title: "被注入的脚本读取 document.cookie",
    detail: "评论区漏洞让攻击者的脚本在本站页面上运行。",
    want: "脚本读不到会话 ID。",
  },
  {
    id: "plain",
    title: "在公共 Wi-Fi 下误开了 http:// 地址",
    detail: "浏览器先发出明文请求 http://library.test/，随后才被重定向到 HTTPS。",
    want: "明文请求不应带上会话。",
  },
] as const;
export type CookieScenarioId = (typeof COOKIE_SCENARIOS)[number]["id"];

export type CookieOutcome = { id: CookieScenarioId; ok: boolean; sent: boolean; detail: string };

export function setCookieLine(config: CookieConfig): string {
  return `Set-Cookie: sid=abc123; Path=${config.path}${config.secure ? "; Secure" : ""}${config.httpOnly ? "; HttpOnly" : ""}; SameSite=${config.sameSite}`;
}

export function evaluateCookie(config: CookieConfig): { stored: boolean; outcomes: CookieOutcome[]; passed: boolean } {
  const stored = !(config.sameSite === "None" && !config.secure);
  const covers = (path: string) => path === config.path || path.startsWith(config.path.endsWith("/") ? config.path : `${config.path}/`);
  const reject = "浏览器拒收了这个 Cookie：SameSite=None 必须同时带 Secure。";
  const outcomes: CookieOutcome[] = COOKIE_SCENARIOS.map(({ id }) => {
    if (!stored) {
      // Nothing was stored, so no scenario is "safe" in any meaningful sense.
      return { id, ok: false, sent: false, detail: reject };
    }
    switch (id) {
      case "own": {
        const page = covers("/account/loans");
        const api = covers("/api/loans");
        const ok = page && api;
        return {
          id,
          ok,
          sent: page || api,
          detail: ok
            ? "/account/loans 和 /api/loans 都在 Path 范围内，都带上了 Cookie。"
            : `Path=${config.path} 只覆盖 ${config.path} 开头的路径：${page ? "" : "/account/loans "}${api ? "" : "/api/loans "}没带 Cookie。`,
        };
      }
      case "email": {
        const sent = config.sameSite !== "Strict" && covers("/account/loans");
        return {
          id,
          ok: sent,
          sent,
          detail:
            config.sameSite === "Strict"
              ? "SameSite=Strict：从别的网站跳过来的请求一律不带 Cookie，读者看起来像没登录。"
              : sent
                ? `SameSite=${config.sameSite} 允许跨站的顶层 GET 跳转带 Cookie。`
                : "跳转本身被允许，但 Path 不覆盖 /account/loans。",
        };
      }
      case "csrf": {
        const sent = config.sameSite === "None" && covers("/api/loans");
        return {
          id,
          ok: !sent,
          sent,
          detail: sent
            ? "SameSite=None：跨站 POST 也带上了会话，恶意网站可以冒充读者借书（CSRF）。"
            : config.sameSite === "None"
              ? "Path 恰好不覆盖 /api/loans 才没带上——这是碰巧，不是防护。"
              : `SameSite=${config.sameSite}：跨站发起的 POST 不带 Cookie。`,
        };
      }
      case "xss":
        return {
          id,
          ok: config.httpOnly,
          sent: !config.httpOnly,
          detail: config.httpOnly
            ? "HttpOnly：document.cookie 里看不到 sid，脚本偷不走它。"
            : "没有 HttpOnly：脚本执行 document.cookie 就能读到 sid=abc123 并发给攻击者。",
        };
      case "plain": {
        const sent = !config.secure && covers("/");
        return {
          id,
          ok: !sent,
          sent,
          detail: config.secure
            ? "Secure：明文 HTTP 请求不带这个 Cookie。"
            : sent
              ? "没有 Secure：会话 ID 随明文请求发出，同一 Wi-Fi 下的人能直接看到。"
              : "这次因为 Path 不覆盖 / 才没发出去；换个路径就会泄露。没有 Secure 并不安全。",
        };
      }
    }
  });
  // The "plain" case only counts as safe because of Secure, never by Path luck.
  const plain = outcomes.find((item) => item.id === "plain")!;
  if (stored && !config.secure) plain.ok = false;
  const csrf = outcomes.find((item) => item.id === "csrf")!;
  if (stored && config.sameSite === "None") csrf.ok = false;
  return { stored, outcomes, passed: outcomes.every((item) => item.ok) };
}

// ---------------------------------------------------------------------------
// Ch10 cache lab: choose Cache-Control for three resources over two days.
// ---------------------------------------------------------------------------

export const CACHE_POLICIES = ["no-store", "no-cache", "max-age=600", "max-age=31536000, immutable"] as const;
export type CachePolicy = (typeof CACHE_POLICIES)[number];
export const CACHE_RESOURCES = [
  { id: "html", label: "/index.html", description: "页面骨架，发布新版本时会变" },
  { id: "js", label: "/app.[hash].js", description: "文件名里带内容哈希，内容一变文件名就变" },
  { id: "loans", label: "/api/loans", description: "读者的个人借阅记录" },
] as const;
export type CacheResourceId = (typeof CACHE_RESOURCES)[number]["id"];
export type CacheConfig = Record<CacheResourceId, CachePolicy>;
export const CACHE_INITIAL: CacheConfig = { html: "max-age=31536000, immutable", js: "no-store", loans: "max-age=600" };

/** Minutes since day 1 00:00. */
const at = (day: number, hour: number, minute: number) => (day - 1) * 1440 + hour * 60 + minute;

export const CACHE_TIMELINE = [
  { kind: "visit", at: at(1, 9, 0), label: "第 1 天 09:00 · 首次打开网站" },
  { kind: "visit", at: at(1, 9, 3), label: "第 1 天 09:03 · 刷新页面" },
  { kind: "event", at: at(1, 9, 4), label: "第 1 天 09:04 · 读者借了一本书（借阅记录变了）" },
  { kind: "visit", at: at(1, 9, 6), label: "第 1 天 09:06 · 打开「我的借阅」确认" },
  { kind: "visit", at: at(1, 11, 30), label: "第 1 天 11:30 · 再次访问（网站没有更新）" },
  { kind: "event", at: at(1, 14, 0), label: "第 1 天 14:00 · 网站发布新版本（HTML 和 JS 都变了）" },
  { kind: "visit", at: at(1, 14, 30), label: "第 1 天 14:30 · 再次访问" },
  { kind: "visit", at: at(2, 9, 0), label: "第 2 天 09:00 · 第二天再来" },
] as const;

export type CacheCell = {
  action: "download" | "revalidate-304" | "revalidate-200" | "cache" | "stale";
  bytes: number;
  url: string;
};
export type CacheRow = { label: string; cells: Record<CacheResourceId, CacheCell> };

const SIZES: Record<CacheResourceId, number> = { html: 6_000, js: 180_000, loans: 2_000 };
const HEADER_BYTES = 300;

export function simulateCache(config: CacheConfig) {
  // version of each resource's content, and its URL (js changes name on deploy)
  const version: Record<CacheResourceId, number> = { html: 1, js: 1, loans: 1 };
  const urlOf = (id: CacheResourceId) => (id === "js" ? (version.js === 1 ? "/app.3f9a.js" : "/app.8c21.js") : CACHE_RESOURCES.find((item) => item.id === id)!.label);
  type Entry = { url: string; version: number; storedAt: number };
  const cache: Partial<Record<CacheResourceId, Entry>> = {};
  const rows: CacheRow[] = [];
  const maxAge = (policy: CachePolicy) => (policy === "max-age=600" ? 10 : policy.startsWith("max-age=31536000") ? 525_600 : 0);

  for (const step of CACHE_TIMELINE) {
    if (step.kind === "event") {
      if (step.at === at(1, 9, 4)) version.loans += 1;
      else {
        version.html += 1;
        version.js += 1;
      }
      continue;
    }
    const cells = {} as Record<CacheResourceId, CacheCell>;
    for (const { id } of CACHE_RESOURCES) {
      const policy = config[id];
      const url = urlOf(id);
      const entry = cache[id]?.url === url ? cache[id] : undefined;
      let cell: CacheCell;
      if (policy === "no-store" || !entry) {
        cell = { action: "download", bytes: SIZES[id] + HEADER_BYTES, url };
      } else if (step.at - entry.storedAt < maxAge(policy)) {
        cell = { action: entry.version === version[id] ? "cache" : "stale", bytes: 0, url };
      } else if (entry.version === version[id]) {
        cell = { action: "revalidate-304", bytes: HEADER_BYTES, url };
      } else {
        cell = { action: "revalidate-200", bytes: SIZES[id] + HEADER_BYTES, url };
      }
      if (policy === "no-store") delete cache[id];
      else if (cell.action !== "cache" && cell.action !== "stale") cache[id] = { url, version: version[id], storedAt: step.at };
      else if (cell.action === "cache") cache[id] = entry;
      cells[id] = cell;
    }
    // An outdated HTML page still references the old JS file, so the reader runs old code.
    if (cells.html.action === "stale") {
      cells.js = { action: "stale", bytes: config.js === "no-store" ? SIZES.js + HEADER_BYTES : 0, url: "/app.3f9a.js" };
    }
    rows.push({ label: step.label, cells });
  }

  const all = rows.flatMap((row) => CACHE_RESOURCES.map(({ id }) => ({ id, cell: row.cells[id] })));
  const goals = [
    {
      id: "fresh",
      label: "读者从没看到过期内容",
      ok: all.every(({ cell }) => cell.action !== "stale"),
    },
    {
      id: "private",
      label: "个人借阅记录不写入浏览器缓存",
      ok: config.loans === "no-store",
    },
    {
      id: "js",
      label: "JS 文件只在文件名变化时下载，平时一个请求都不发",
      ok: all.filter(({ id }) => id === "js").every(({ cell }) => cell.action === "download" ? isFirstOf(rows, cell.url) : cell.action === "cache"),
    },
    {
      id: "html",
      label: "HTML 没变时不重复下载完整内容",
      ok: config.html !== "no-store",
    },
  ];
  const bytes = all.reduce((sum, { cell }) => sum + cell.bytes, 0);
  const requests = all.filter(({ cell }) => cell.action !== "cache" && cell.action !== "stale").length;
  return { rows, goals, bytes, requests, passed: goals.every((goal) => goal.ok) };
}

function isFirstOf(rows: CacheRow[], url: string): boolean {
  return rows.flatMap((row) => [row.cells.js]).filter((cell) => cell.url === url && cell.action !== "stale" && cell.action !== "cache").length === 1;
}

// ---------------------------------------------------------------------------
// Ch11 diagnosis lab: a recorded Network panel for a broken page.
// ---------------------------------------------------------------------------

export const DIAGNOSIS_OPTIONS = [
  { id: "ok", label: "正常（包括命中缓存、304 验证）" },
  { id: "harmless", label: "失败了，但不影响这个页面的功能" },
  { id: "dns", label: "域名解析失败，请求根本没发出" },
  { id: "cookie", label: "会话 Cookie 没有随请求发送" },
  { id: "server", label: "服务器内部出错" },
  { id: "media", label: "请求正文的类型不被接受" },
] as const;
export type DiagnosisOption = (typeof DIAGNOSIS_OPTIONS)[number]["id"];

export type RecordedRequest = {
  id: string;
  method: Method;
  url: string;
  status: string;
  type: string;
  size: string;
  time: string;
  request: string;
  response: string;
  /** Absent for context-only rows that are not graded. */
  answer?: DiagnosisOption;
  note?: string;
};

export const DIAGNOSIS_PAGE = "https://library.test/account/loans";

export const DIAGNOSIS_REQUESTS: RecordedRequest[] = [
  {
    id: "login",
    method: "POST",
    url: "https://library.test/api/session",
    status: "201",
    type: "fetch",
    size: "120 B",
    time: "63 ms",
    request:
      'POST /api/session HTTP/1.1\nHost: library.test\nContent-Type: application/json\n\n{"username":"xiaolin","password":"••••••"}',
    response:
      'HTTP/1.1 201 Created\nContent-Type: application/json; charset=utf-8\nSet-Cookie: sid=sid-xiaolin-7; Path=/account; HttpOnly; Secure; SameSite=Lax\n\n{"user":"xiaolin","role":"reader"}',
    note: "登录页发出的请求（开启了 Preserve log，跳转后仍保留）",
  },
  {
    id: "doc",
    method: "GET",
    url: "https://library.test/account/loans",
    status: "200",
    type: "document",
    size: "6.1 kB",
    time: "84 ms",
    request: "GET /account/loans HTTP/1.1\nHost: library.test\nAccept: text/html\nCookie: sid=sid-xiaolin-7",
    response: "HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nContent-Length: 6120\n\n<!doctype html>…",
    answer: "ok",
  },
  {
    id: "js",
    method: "GET",
    url: "https://library.test/app.8c21.js",
    status: "200",
    type: "script",
    size: "(内存缓存)",
    time: "0 ms",
    request: "（没有发出网络请求，直接使用了缓存副本）",
    response: "HTTP/1.1 200 OK\nContent-Type: text/javascript\nCache-Control: max-age=31536000, immutable",
    answer: "ok",
  },
  {
    id: "font",
    method: "GET",
    url: "https://cdn.libary.test/fonts/kai.woff2",
    status: "(failed)",
    type: "font",
    size: "0 B",
    time: "12 ms",
    request: "GET /fonts/kai.woff2 HTTP/1.1\nHost: cdn.libary.test",
    response: "net::ERR_NAME_NOT_RESOLVED\n（没有任何 HTTP 响应）",
    answer: "dns",
  },
  {
    id: "loans",
    method: "GET",
    url: "https://library.test/api/loans",
    status: "401",
    type: "fetch",
    size: "96 B",
    time: "41 ms",
    request: "GET /api/loans HTTP/1.1\nHost: library.test\nAccept: application/json",
    response:
      'HTTP/1.1 401 Unauthorized\nContent-Type: application/json; charset=utf-8\n\n{"error":"login_required"}',
    answer: "cookie",
  },
  {
    id: "rec",
    method: "GET",
    url: "https://library.test/api/recommendations",
    status: "500",
    type: "fetch",
    size: "88 B",
    time: "1.20 s",
    request: "GET /api/recommendations HTTP/1.1\nHost: library.test\nAccept: application/json",
    response: 'HTTP/1.1 500 Internal Server Error\nContent-Type: application/json; charset=utf-8\n\n{"error":"internal_error","requestId":"req_7f3a"}',
    answer: "server",
  },
  {
    id: "book",
    method: "GET",
    url: "https://library.test/api/books/2",
    status: "304",
    type: "fetch",
    size: "312 B",
    time: "35 ms",
    request: 'GET /api/books/2 HTTP/1.1\nHost: library.test\nAccept: application/json\nIf-None-Match: "b2-v1"',
    response: 'HTTP/1.1 304 Not Modified\nETag: "b2-v1"\nCache-Control: no-cache',
    answer: "ok",
  },
  {
    id: "renew",
    method: "PATCH",
    url: "https://library.test/api/loans/12",
    status: "415",
    type: "fetch",
    size: "140 B",
    time: "38 ms",
    request: 'PATCH /api/loans/12 HTTP/1.1\nHost: library.test\nContent-Type: text/plain\n\n{"renew":true}',
    response:
      'HTTP/1.1 415 Unsupported Media Type\nContent-Type: application/json; charset=utf-8\n\n{"error":"unsupported_media_type","expected":"application/json"}',
    answer: "media",
  },
  {
    id: "favicon",
    method: "GET",
    url: "https://library.test/favicon.ico",
    status: "404",
    type: "other",
    size: "0 B",
    time: "22 ms",
    request: "GET /favicon.ico HTTP/1.1\nHost: library.test",
    response: "HTTP/1.1 404 Not Found",
    answer: "harmless",
  },
];

/** Which single request explains the empty "my loans" list. */
export const DIAGNOSIS_ROOT = "loans";

export function gradeDiagnosis(answers: Record<string, string>, root: string | undefined) {
  const results = DIAGNOSIS_REQUESTS.filter((item) => item.answer).map((item) => answers[item.id] === item.answer);
  const correct = results.filter(Boolean).length;
  const rootOk = root === DIAGNOSIS_ROOT;
  let hint = "";
  if (answers.book && answers.book !== "ok") hint = "304 不是错误：它说明缓存副本仍然有效。";
  else if (answers.font && answers.font !== "dns") hint = "状态显示 (failed) 而不是数字，说明根本没有 HTTP 响应。";
  else if (answers.loans && answers.loans !== "cookie") hint = "对比 /api/loans 的请求头，和登录响应里 Set-Cookie 的 Path。";
  else if (!rootOk && root) hint = "「我的借阅」是空的——哪条请求负责取借阅数据？";
  return { results, correct, total: results.length, rootOk, passed: correct === results.length && rootOk, hint };
}

// ---------------------------------------------------------------------------
// Ch12 final mission: borrow an available copy for xiaolin, via the API only.
// ---------------------------------------------------------------------------

export const MISSION = {
  ticket:
    "读者小林（用户名 xiaolin，密码 read-more）想借《HTTP 实战手册》，但网站前端坏了。请你直接调用 API，帮他借到一本现在能借的。",
  docs: [
    { method: "GET", path: "/api/books?q=关键词", note: "按书名搜索" },
    { method: "POST", path: "/api/session", note: 'JSON {"username","password"}，成功后下发会话 Cookie' },
    { method: "POST", path: "/api/loans", note: 'JSON {"bookId": 数字}，需要登录' },
    { method: "GET", path: "/api/loans", note: "查看自己的借阅，需要登录" },
    { method: "DELETE", path: "/api/loans/:id", note: "还书，需要登录" },
  ],
};

export function gradeMission(history: LabRequest[]): { passed: boolean; message: string } {
  if (history.length === 0) return { passed: false, message: "还没有发送任何请求。" };
  const { world, results } = replay(history);
  const mine = world.loans.filter((loan) => loan.user === "xiaolin");
  if (mine.length === 1 && mine[0].bookId === 8) {
    return { passed: true, message: "小林借到了《HTTP 实战手册（第 2 版）》。搜索、登录、Cookie、JSON 正文全部串起来了。" };
  }
  if (mine.length > 1) return { passed: false, message: "小林名下借了不止一本，只需要借一本。用 DELETE 把多借的还掉。" };
  if (mine.length === 1) return { passed: false, message: "借到的不是《HTTP 实战手册》。用 DELETE 还掉再借。" };
  const statuses = results.map((item) => item.response?.status);
  if (statuses.includes(409)) return { passed: false, message: "409 说明那本已被借走。搜索结果里还有别的版本吗？" };
  if (statuses.includes(401) && !world.jar.some((cookie) => cookie.name === "sid")) {
    return { passed: false, message: "借书接口返回 401：浏览器里还没有会话 Cookie，先登录。" };
  }
  return { passed: false, message: "小林名下还没有借阅记录。" };
}
