/**
 * The course's single teaching world: a small library website at
 * https://library.test with a JSON API. Every lab talks to this server, so
 * lessons build on each other instead of each inventing a new toy.
 *
 * `serve` is the server; `browserSend` plays the browser in front of it
 * (URL parsing, Host header, cookie jar). Both are pure: they return a new
 * world instead of mutating the input.
 */
import {
  type Header,
  type LabRequest,
  type LabResponse,
  type Method,
  type NetworkError,
  type WireRequest,
  getHeader,
  byteLength,
  isBrowserManaged,
  makeResponse,
} from "./http";

export const SITE_HOST = "library.test";
export const SITE_ORIGIN = `https://${SITE_HOST}`;

export type Book = {
  id: number;
  title?: string;
  author?: string;
  year?: number;
  available?: boolean;
  /** Increments on every change; drives the ETag. */
  rev: number;
};
export type Note = { id: number; title: string };
export type Loan = { id: number; user: string; bookId: number };
export type Role = "reader" | "librarian";
export type Session = { user: string; role: Role };
export type StoredCookie = { name: string; value: string; path: string; httpOnly: boolean };

export type World = {
  books: Book[];
  notes: Note[];
  loans: Loan[];
  sessions: Record<string, Session>;
  /** The simulated browser's cookie jar for library.test. */
  jar: StoredCookie[];
  seq: number;
};

export const USERS: Record<string, { password: string; role: Role }> = {
  xiaolin: { password: "read-more", role: "reader" },
  librarian: { password: "shelf-2024", role: "librarian" },
};

export const INITIAL_BOOKS: Book[] = [
  { id: 1, title: "浏览器工作原理入门", author: "王一", year: 2021, available: true, rev: 1 },
  { id: 2, title: "HTTP 从入门到排错", author: "李明", year: 2023, available: true, rev: 1 },
  { id: 3, title: "HTTP 实战手册", author: "陈晨", year: 2022, available: false, rev: 1 },
  { id: 4, title: "Web 安全基础", author: "赵宁", year: 2020, available: true, rev: 1 },
  { id: 5, title: "缓存的艺术", author: "周舟", year: 2019, available: true, rev: 1 },
  { id: 6, title: "JSON 与 API 设计", author: "孙悦", year: 2022, available: true, rev: 1 },
  { id: 7, title: "TCP/IP 漫游指男", author: "吴迪", year: 2018, available: true, rev: 1 },
  { id: 8, title: "HTTP 实战手册（第 2 版）", author: "陈晨", year: 2024, available: true, rev: 1 },
];

export const INITIAL_LOANS: Loan[] = [{ id: 1, user: "someone-else", bookId: 3 }];

export function createWorld(options: { as?: string } = {}): World {
  const world: World = {
    books: INITIAL_BOOKS.map((book) => ({ ...book })),
    notes: [{ id: 41, title: "第二章的例子很好懂" }],
    loans: INITIAL_LOANS.map((loan) => ({ ...loan })),
    sessions: {},
    jar: [],
    seq: 100,
  };
  if (options.as && USERS[options.as]) {
    const sid = `sid-${options.as}-0`;
    world.sessions[sid] = { user: options.as, role: USERS[options.as].role };
    world.jar.push({ name: "sid", value: sid, path: "/", httpOnly: true });
  }
  return world;
}

function clone(world: World): World {
  return {
    books: world.books.map((book) => ({ ...book })),
    notes: world.notes.map((note) => ({ ...note })),
    loans: world.loans.map((loan) => ({ ...loan })),
    sessions: { ...world.sessions },
    jar: world.jar.map((cookie) => ({ ...cookie })),
    seq: world.seq,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const JSON_TYPE: Header = { name: "Content-Type", value: "application/json; charset=utf-8" };
const PAGE_SIZE = 3;

export function etagOf(book: Book): string {
  return `"b${book.id}-v${book.rev}"`;
}

export function publicBook(book: Book): Omit<Book, "rev"> {
  const copy: Partial<Book> = { ...book };
  delete copy.rev;
  return copy as Omit<Book, "rev">;
}

function json(status: number, body: unknown, note: string, extra: Header[] = []): LabResponse {
  return makeResponse(status, [JSON_TYPE, ...extra], body, note);
}

function methodNotAllowed(allow: string, note: string): LabResponse {
  return json(405, { error: "method_not_allowed" }, note, [{ name: "Allow", value: allow }]);
}

function acceptsJson(accept: string | undefined): boolean {
  if (!accept) return true;
  return accept
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase())
    .some((type) => type === "application/json" || type === "application/*" || type === "*/*");
}

type BodyResult = { ok: true; data: Record<string, unknown> } | { ok: false; response: LabResponse };

function readJsonBody(request: WireRequest, allowMergePatch = false): BodyResult {
  const type = (getHeader(request.headers, "content-type") ?? "").split(";")[0].trim().toLowerCase();
  const accepted = type === "application/json" || (allowMergePatch && type === "application/merge-patch+json");
  if (!accepted) {
    return {
      ok: false,
      response: json(
        415,
        { error: "unsupported_media_type", expected: "application/json", received: type || null },
        type
          ? `服务器只解析 JSON，但请求声明正文是 ${type}。`
          : "请求带了正文，却没有用 Content-Type 说明正文是什么格式。",
      ),
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(request.body);
  } catch {
    return {
      ok: false,
      response: json(
        400,
        { error: "invalid_json" },
        "正文声明为 JSON，但不是合法 JSON。常见原因：键名没用双引号、用了单引号、末尾多了逗号。",
      ),
    };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, response: json(400, { error: "object_expected" }, "这里需要一个 JSON 对象 {…}。") };
  }
  return { ok: true, data: data as Record<string, unknown> };
}

function sessionOf(world: World, request: WireRequest): Session | null {
  const cookie = getHeader(request.headers, "cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "sid") {
      const session = world.sessions[rest.join("=")];
      if (session) return session;
    }
  }
  return null;
}

const LOGIN_REQUIRED = (note = "请求里没有有效的会话 Cookie，服务器不知道你是谁。") =>
  json(401, { error: "login_required" }, note);

const BOOK_FIELDS = ["title", "author", "year", "available"] as const;

function pickBookFields(data: Record<string, unknown>): Partial<Book> | string {
  const out: Partial<Book> = {};
  if (data.title !== undefined) {
    if (typeof data.title !== "string") return "title 必须是字符串";
    out.title = data.title;
  }
  if (data.author !== undefined) {
    if (typeof data.author !== "string") return "author 必须是字符串";
    out.author = data.author;
  }
  if (data.year !== undefined) {
    if (typeof data.year !== "number" || !Number.isInteger(data.year)) return "year 必须是整数";
    out.year = data.year;
  }
  if (data.available !== undefined) {
    if (typeof data.available !== "boolean") return "available 必须是 true/false";
    out.available = data.available;
  }
  return out;
}

/** The library.test server. Receives exactly what goes over the wire. */
export function serve(input: World, request: WireRequest): { world: World; response: LabResponse } {
  const world = clone(input);
  const respond = (response: LabResponse) => ({ world, response });
  const url = new URL(request.target, SITE_ORIGIN);
  const path = url.pathname;
  const method = request.method;

  if (path === "/old-catalog") {
    return respond(
      makeResponse(
        301,
        [{ name: "Location", value: "/api/books?page=1" }],
        undefined,
        "旧地址已永久搬家，Location 告诉浏览器新地址。",
      ),
    );
  }

  if (!path.startsWith("/api/")) {
    return respond(json(404, { error: "not_found", path }, "这个网站上没有这个路径。"));
  }

  if (!acceptsJson(getHeader(request.headers, "accept"))) {
    return respond(
      json(
        406,
        { error: "not_acceptable", available: ["application/json"] },
        "Accept 说只想要其他格式，但这个 API 只能给出 JSON 表示。",
      ),
    );
  }

  const session = sessionOf(world, request);

  // /api/books ---------------------------------------------------------------
  if (path === "/api/books") {
    if (method === "GET" || method === "HEAD") {
      const q = (url.searchParams.get("q") ?? "").trim();
      const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
      const matched = world.books.filter((book) => !q || (book.title ?? "").includes(q));
      const items = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(publicBook);
      const response = json(
        200,
        { q: q || null, page, pageSize: PAGE_SIZE, total: matched.length, items },
        q ? `搜索「${q}」，共 ${matched.length} 本，这是第 ${page} 页。` : `图书列表第 ${page} 页（每页 ${PAGE_SIZE} 本）。`,
      );
      return respond(method === "HEAD" ? { ...response, body: "" } : response);
    }
    return respond(methodNotAllowed("GET, HEAD", "图书集合只支持读取。"));
  }

  // /api/books/:id ------------------------------------------------------------
  const bookMatch = /^\/api\/books\/([^/]+)$/.exec(path);
  if (bookMatch) {
    const allow = "GET, HEAD, PUT, PATCH, DELETE";
    if (!["GET", "HEAD", "PUT", "PATCH", "DELETE"].includes(method)) {
      return respond(methodNotAllowed(allow, "单本图书不能用 POST；POST 通常发给集合来新建资源。"));
    }
    const id = /^\d+$/.test(bookMatch[1]) ? Number(bookMatch[1]) : NaN;
    const index = world.books.findIndex((book) => book.id === id);
    if (index < 0) {
      return respond(
        json(404, { error: "book_not_found" }, Number.isNaN(id) ? "图书地址里应该是数字 ID，而不是书名。" : `没有 ID 为 ${id} 的图书。`),
      );
    }
    const book = world.books[index];
    if (method === "GET" || method === "HEAD") {
      const tag = etagOf(book);
      const cacheHeaders = [
        { name: "ETag", value: tag },
        { name: "Cache-Control", value: "no-cache" },
      ];
      if (getHeader(request.headers, "if-none-match") === tag) {
        return respond(makeResponse(304, cacheHeaders, undefined, "ETag 没变：你手里的副本仍然有效，不用重新传正文。"));
      }
      const response = json(200, publicBook(book), `找到了 ${id} 号图书。`, cacheHeaders);
      return respond(method === "HEAD" ? { ...response, body: "" } : response);
    }
    if (!session) return respond(LOGIN_REQUIRED("修改图书需要先登录。"));
    if (session.role !== "librarian") {
      return respond(json(403, { error: "forbidden" }, `服务器认出了你是 ${session.user}，但读者没有修改馆藏的权限。`));
    }
    if (method === "DELETE") {
      world.books.splice(index, 1);
      return respond(makeResponse(204, [], undefined, `${id} 号图书已从馆藏中删除。`));
    }
    const body = readJsonBody(request, method === "PATCH");
    if (!body.ok) return respond(body.response);
    const fields = pickBookFields(body.data);
    if (typeof fields === "string") return respond(json(400, { error: "invalid_field", message: fields }, fields));
    if (method === "PUT") {
      // PUT replaces the whole representation: omitted fields are gone.
      world.books[index] = { id, ...fields, rev: book.rev + 1 };
      const missing = BOOK_FIELDS.filter((field) => fields[field] === undefined);
      return respond(
        json(
          200,
          publicBook(world.books[index]),
          missing.length
            ? `PUT 用你发送的内容整体替换了这本书；没发送的字段（${missing.join("、")}）被清空了。`
            : "PUT 用完整的新表示替换了这本书。",
        ),
      );
    }
    world.books[index] = { ...book, ...fields, rev: book.rev + 1 };
    return respond(json(200, publicBook(world.books[index]), "PATCH 只修改了你发送的字段，其余保持不变。"));
  }

  // /api/notes ------------------------------------------------------------------
  if (path === "/api/notes") {
    if (method === "GET") return respond(json(200, { items: world.notes }, "所有读者留言。"));
    if (method !== "POST") return respond(methodNotAllowed("GET, POST", "留言只能读取或新建。"));
    const body = readJsonBody(request);
    if (!body.ok) return respond(body.response);
    const title = body.data.title;
    if (typeof title !== "string" || !title.trim()) {
      return respond(json(400, { error: "title_required" }, "JSON 合法，但缺少非空字符串字段 title。"));
    }
    const note = { id: ++world.seq, title: title.trim().slice(0, 100) };
    world.notes.push(note);
    return respond(
      json(201, note, "留言已创建。201 表示新资源已生成，Location 给出它的地址。", [
        { name: "Location", value: `/api/notes/${note.id}` },
      ]),
    );
  }

  // /api/session ----------------------------------------------------------------
  if (path === "/api/session") {
    if (method === "DELETE") {
      return respond(
        makeResponse(
          204,
          [{ name: "Set-Cookie", value: "sid=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }],
          undefined,
          "已退出：服务器让浏览器删除会话 Cookie。",
        ),
      );
    }
    if (method !== "POST") return respond(methodNotAllowed("POST, DELETE", "登录用 POST，退出用 DELETE。"));
    const body = readJsonBody(request);
    if (!body.ok) return respond(body.response);
    const username = typeof body.data.username === "string" ? body.data.username : "";
    const user = USERS[username];
    if (!user || body.data.password !== user.password) {
      return respond(json(401, { error: "invalid_credentials" }, "用户名或密码不对。"));
    }
    const sid = `sid-${username}-${++world.seq}`;
    world.sessions[sid] = { user: username, role: user.role };
    return respond(
      json(201, { user: username, role: user.role }, "登录成功：服务器建了会话，并用 Set-Cookie 把会话 ID 交给浏览器。", [
        { name: "Set-Cookie", value: `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax` },
      ]),
    );
  }

  // /api/me ---------------------------------------------------------------------
  if (path === "/api/me") {
    if (method !== "GET") return respond(methodNotAllowed("GET", "只能读取。"));
    if (!session) return respond(LOGIN_REQUIRED());
    return respond(json(200, session, `会话有效，你是 ${session.user}。`));
  }

  // /api/loans ------------------------------------------------------------------
  if (path === "/api/loans") {
    if (method !== "GET" && method !== "POST") return respond(methodNotAllowed("GET, POST", "借阅记录只能读取或新建。"));
    if (!session) return respond(LOGIN_REQUIRED("借书和查看借阅都需要登录。"));
    if (method === "GET") {
      const items = world.loans
        .filter((loan) => loan.user === session.user)
        .map((loan) => ({ ...loan, title: world.books.find((book) => book.id === loan.bookId)?.title ?? null }));
      return respond(json(200, { items }, `${session.user} 当前借了 ${items.length} 本书。`));
    }
    const body = readJsonBody(request);
    if (!body.ok) return respond(body.response);
    const bookId = body.data.bookId;
    if (typeof bookId !== "number" || !Number.isInteger(bookId)) {
      return respond(json(400, { error: "book_id_required" }, "需要整数字段 bookId，例如 {\"bookId\": 2}。注意数字不要加引号。"));
    }
    const book = world.books.find((item) => item.id === bookId);
    if (!book) return respond(json(404, { error: "book_not_found" }, `没有 ID 为 ${bookId} 的图书。`));
    if (!book.available) {
      return respond(json(409, { error: "already_borrowed" }, "这本书已被借走：请求本身没问题，但和资源当前状态冲突。"));
    }
    book.available = false;
    book.rev += 1;
    const loan = { id: ++world.seq, user: session.user, bookId };
    world.loans.push(loan);
    return respond(
      json(201, loan, `借书成功：《${book.title ?? bookId}》已记在 ${session.user} 名下。`, [
        { name: "Location", value: `/api/loans/${loan.id}` },
      ]),
    );
  }

  const loanMatch = /^\/api\/loans\/(\d+)$/.exec(path);
  if (loanMatch) {
    if (method !== "DELETE") return respond(methodNotAllowed("DELETE", "单条借阅只支持 DELETE（还书）。"));
    if (!session) return respond(LOGIN_REQUIRED());
    const id = Number(loanMatch[1]);
    const index = world.loans.findIndex((loan) => loan.id === id && loan.user === session.user);
    if (index < 0) return respond(json(404, { error: "loan_not_found" }, "你名下没有这条借阅。"));
    const [loan] = world.loans.splice(index, 1);
    const book = world.books.find((item) => item.id === loan.bookId);
    if (book) {
      book.available = true;
      book.rev += 1;
    }
    return respond(makeResponse(204, [], undefined, "已还书。"));
  }

  // /api/admin/reports ----------------------------------------------------------
  if (path === "/api/admin/reports") {
    if (method !== "GET") return respond(methodNotAllowed("GET", "只能读取。"));
    if (!session) return respond(LOGIN_REQUIRED());
    if (session.role !== "librarian") {
      return respond(json(403, { error: "forbidden" }, `服务器认出了你是 ${session.user}，但报表只对馆员开放。`));
    }
    return respond(json(200, { loansToday: world.loans.length }, "馆员可以查看报表。"));
  }

  return respond(json(404, { error: "not_found", path }, "API 里没有这个路径。"));
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export type ParsedUrl = {
  scheme: string;
  host: string;
  port: string;
  path: string;
  query: string;
  fragment: string;
  /** What goes into the request line: path + query, never the fragment. */
  target: string;
};

export function parseUrl(raw: string): ParsedUrl | null {
  try {
    const url = new URL(raw.trim(), SITE_ORIGIN);
    return {
      scheme: url.protocol.replace(/:$/, ""),
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      query: url.search,
      fragment: url.hash,
      target: `${url.pathname}${url.search}`,
    };
  } catch {
    return null;
  }
}

export type BrowserResult = {
  world: World;
  wire: WireRequest | null;
  response: LabResponse | null;
  error: NetworkError | null;
  /** Things the browser did on the learner's behalf, in order. */
  log: string[];
};

function cookiePathMatches(cookiePath: string, requestPath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function storeCookies(world: World, response: LabResponse, log: string[]) {
  for (const header of response.headers) {
    if (header.name.toLowerCase() !== "set-cookie") continue;
    const [pair, ...attributes] = header.value.split(";").map((part) => part.trim());
    const [name, ...rest] = pair.split("=");
    const value = rest.join("=");
    const attr = (key: string) => attributes.find((item) => item.toLowerCase().startsWith(key.toLowerCase()));
    const path = attr("path=")?.slice(5) || "/";
    const expired = attr("max-age=")?.slice(8) === "0";
    world.jar = world.jar.filter((cookie) => !(cookie.name === name && cookie.path === path));
    if (expired) {
      log.push(`浏览器删除了 Cookie「${name}」。`);
    } else {
      world.jar.push({ name, value, path, httpOnly: Boolean(attr("httponly")) });
      log.push(`浏览器把 Cookie「${name}」存进了 Cookie 罐（Path=${path}）。`);
    }
  }
}

/**
 * Send a learner-authored request the way a browser would: resolve the URL,
 * drop the fragment, add Host, attach matching cookies, store Set-Cookie.
 */
export function browserSend(input: World, request: LabRequest): BrowserResult {
  const world = clone(input);
  const log: string[] = [];
  const url = parseUrl(request.url);
  if (!url) {
    return {
      world,
      wire: null,
      response: null,
      error: { error: "ERR_INVALID_URL", note: "这不是一个合法的 URL。" },
      log,
    };
  }
  if (url.host !== SITE_HOST) {
    return {
      world,
      wire: null,
      response: null,
      error: {
        error: "ERR_NAME_NOT_RESOLVED",
        note: `找不到主机 ${url.host}：DNS 查不到它的地址，请求根本没有发出去。（模拟世界里只有 ${SITE_HOST}）`,
      },
      log,
    };
  }
  if (url.port && url.port !== "443" && url.scheme === "https") {
    return {
      world,
      wire: null,
      response: null,
      error: {
        error: "ERR_CONNECTION_REFUSED",
        note: `${SITE_HOST} 的 ${url.port} 端口上没有服务在监听，连接被拒绝。HTTPS 默认用 443 端口，通常不用写。`,
      },
      log,
    };
  }
  if (url.fragment) log.push(`片段 ${decodeURIComponent(url.fragment)} 只留在浏览器里，没有发给服务器。`);

  const headers: Header[] = [{ name: "Host", value: SITE_HOST }];
  const ignored: string[] = [];
  for (const header of request.headers) {
    if (!header.name.trim()) continue;
    if (isBrowserManaged(header.name)) {
      ignored.push(header.name.trim());
      continue;
    }
    headers.push({ name: header.name.trim(), value: header.value.trim() });
  }
  if (ignored.length) log.push(`${ignored.join("、")} 由浏览器自己管理，页面填写的值被忽略。`);

  const cookies = world.jar.filter((cookie) => cookiePathMatches(cookie.path, url.path));
  if (cookies.length) {
    headers.push({ name: "Cookie", value: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") });
    log.push(`浏览器自动附上了 Cookie：${cookies.map((cookie) => cookie.name).join("、")}。`);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body.length > 0;
  if (hasBody) headers.push({ name: "Content-Length", value: String(byteLength(request.body)) });
  const wire: WireRequest = {
    method: request.method as Method,
    target: url.target,
    headers,
    body: hasBody ? request.body : "",
  };
  if (!hasBody && request.body.length > 0) log.push(`${request.method} 请求的正文被浏览器丢弃了。`);

  if (url.scheme === "http") {
    const response = makeResponse(
      301,
      [{ name: "Location", value: `${SITE_ORIGIN}${url.target}` }],
      undefined,
      "这个站点只接受 HTTPS：明文 HTTP 请求被永久重定向到 https:// 地址。",
    );
    return { world, wire, response, error: null, log };
  }

  const served = serve(world, wire);
  storeCookies(served.world, served.response, log);
  return { world: served.world, wire, response: served.response, error: null, log };
}

/** Replay a learner's request history against a fresh world. Used by validators. */
export function replay(requests: LabRequest[], options: { as?: string } = {}) {
  let world = createWorld(options);
  const results: BrowserResult[] = [];
  for (const request of requests) {
    const result = browserSend(world, request);
    world = result.world;
    results.push(result);
  }
  return { world, results };
}
