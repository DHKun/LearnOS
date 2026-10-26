import { describe, expect, it } from "vitest";

import { requestText } from "@/content/courses/http-hands-on/simulation/http";
import {
  CACHE_INITIAL,
  COOKIE_INITIAL,
  DIAGNOSIS_REQUESTS,
  JSON_LAB,
  REQUEST_LAB,
  evaluateCookie,
  getRequest,
  simulateCache,
} from "@/content/courses/http-hands-on/simulation/labs";
import { browserSend, createWorld, replay } from "@/content/courses/http-hands-on/simulation/library";
import {
  validateCacheLab,
  validateCookieLab,
  validateDiagnosisLab,
  validateFinalMission,
  validateJsonLab,
  validateMethodLab,
  validateRequestLab,
  validateResponseLab,
  validateUrlLab,
} from "@/content/courses/http-hands-on/validators";

const json = (method: "POST" | "PUT" | "PATCH", url: string, body: unknown) => ({
  method,
  url,
  headers: [
    { name: "Accept", value: "application/json" },
    { name: "Content-Type", value: "application/json" },
  ],
  body: JSON.stringify(body),
});

describe("http-hands-on 模拟浏览器", () => {
  it("片段不进入请求行，Host 由浏览器补上", () => {
    const result = browserSend(createWorld(), getRequest("https://library.test/api/books?page=2#top"));
    expect(result.wire?.target).toBe("/api/books?page=2");
    expect(requestText(result.wire!)).toContain("Host: library.test");
    expect(result.log.join()).toContain("#top");
  });

  it("错误主机与非默认端口是网络错误，没有 HTTP 响应", () => {
    expect(browserSend(createWorld(), getRequest("https://libary.test/")).error?.error).toBe("ERR_NAME_NOT_RESOLVED");
    expect(browserSend(createWorld(), getRequest("https://library.test:8080/")).error?.error).toBe("ERR_CONNECTION_REFUSED");
    expect(browserSend(createWorld(), getRequest("http://library.test/api/books")).response?.status).toBe(301);
  });

  it("页面不能伪造 Cookie 头；登录后的 Set-Cookie 自动随后续请求发送", () => {
    const forged = browserSend(createWorld(), {
      ...getRequest("/api/me"),
      headers: [{ name: "Cookie", value: "sid=sid-librarian-0" }],
    });
    expect(forged.response?.status).toBe(401);

    const { results } = replay([json("POST", "/api/session", { username: "xiaolin", password: "read-more" }), getRequest("/api/me")]);
    expect(results[0].response?.status).toBe(201);
    expect(results[1].wire?.headers.some((header) => header.name === "Cookie")).toBe(true);
    expect(results[1].response?.status).toBe(200);
  });

  it("Accept 与 Content-Type 都会真正影响结果", () => {
    expect(browserSend(createWorld(), { ...getRequest("/api/books"), headers: [{ name: "Accept", value: "text/html" }] }).response?.status).toBe(406);
    const statuses = [
      JSON_LAB.broken,
      { ...JSON_LAB.broken, headers: [JSON_LAB.broken.headers[1]] },
      { ...JSON_LAB.broken, headers: [{ name: "Content-Type", value: "application/json" }] },
      { ...JSON_LAB.broken, headers: [{ name: "Content-Type", value: "application/json" }], body: '{"title":"周末读完第三章"}' },
    ].map((request) => browserSend(createWorld(), request).response?.status);
    expect(statuses).toEqual([406, 415, 400, 201]);
  });

  it("PUT 整体替换、PATCH 局部修改；读者没有修改权限", () => {
    const put = replay([json("PUT", "/api/books/7", { title: "TCP/IP 漫游指南" })], { as: "librarian" });
    expect(put.world.books.find((book) => book.id === 7)?.author).toBeUndefined();
    const patch = replay([json("PATCH", "/api/books/7", { title: "TCP/IP 漫游指南" })], { as: "librarian" });
    expect(patch.world.books.find((book) => book.id === 7)).toMatchObject({ author: "吴迪", title: "TCP/IP 漫游指南" });
    expect(replay([json("PATCH", "/api/books/7", { title: "x" })], { as: "xiaolin" }).results[0].response?.status).toBe(403);
    expect(replay([json("PATCH", "/api/books/7", { title: "x" })]).results[0].response?.status).toBe(401);
  });

  it("ETag 匹配时返回 304 且没有正文", () => {
    const first = browserSend(createWorld(), getRequest("/api/books/2")).response!;
    const etag = first.headers.find((header) => header.name === "ETag")!.value;
    const second = browserSend(createWorld(), {
      ...getRequest("/api/books/2"),
      headers: [{ name: "If-None-Match", value: etag }],
    }).response!;
    expect(second.status).toBe(304);
    expect(second.body).toBe("");
  });
});

describe("http-hands-on 服务端验证器", () => {
  it("URL 实验：要把片段改成查询参数、去掉错误端口", () => {
    expect(validateUrlLab({ urls: { page: "https://library.test/api/books#page=2", port: "https://library.test/api/books?q=实战" } }).passed).toBe(false);
    expect(validateUrlLab({ urls: { page: "https://library.test/api/books?page=2", port: "https://library.test:8080/api/books?q=实战" } }).passed).toBe(false);
    expect(validateUrlLab({ urls: { page: "https://library.test/api/books?page=2", port: "https://library.test/api/books?q=实战" } }).passed).toBe(true);
  });

  it("请求实验：按书名请求失败，按 ID 请求成功", () => {
    expect(validateRequestLab(REQUEST_LAB.broken).passed).toBe(false);
    expect(validateRequestLab(getRequest("/api/books?q=排错")).passed).toBe(false);
    expect(validateRequestLab(getRequest("/api/books/2")).passed).toBe(true);
    expect(validateRequestLab(getRequest("/api/books/3")).passed).toBe(false);
    expect(validateRequestLab({ method: "GET", url: "x".repeat(600) }).passed).toBe(false);
  });

  it("响应解读：答案来自响应本身", () => {
    const answers = { created: "/api/notes/42", moved: "https://library.test/api/books?page=1", allow: ["GET", "HEAD", "PUT", "PATCH", "DELETE"], retry: "120", html: "html" };
    expect(validateResponseLab({ answers }).passed).toBe(true);
    expect(validateResponseLab({ answers: { ...answers, allow: ["GET", "POST"] } }).passed).toBe(false);
    expect(validateResponseLab({ answers: { ...answers, retry: "60" } }).passed).toBe(false);
  });

  it("方法实验：只有保留其他字段的修改才通过", () => {
    expect(validateMethodLab({ history: [json("PUT", "/api/books/7", { title: "TCP/IP 漫游指南" })] }).passed).toBe(false);
    expect(validateMethodLab({ history: [json("PATCH", "/api/books/7", { title: "TCP/IP 漫游指南" })] }).passed).toBe(true);
    expect(
      validateMethodLab({
        history: [json("PUT", "/api/books/7", { title: "TCP/IP 漫游指南", author: "吴迪", year: 2018, available: true })],
      }).passed,
    ).toBe(true);
    expect(validateMethodLab({ history: [{ method: "DELETE", url: "/api/books/7", headers: [], body: "" }] }).passed).toBe(false);
    // Client-side "passed" claims are ignored.
    expect(validateMethodLab({ history: [], passed: true }).passed).toBe(false);
  });

  it("JSON 实验：三处错误都修好才 201", () => {
    expect(validateJsonLab(JSON_LAB.broken).passed).toBe(false);
    expect(validateJsonLab(json("POST", "/api/notes", { title: "好书" })).passed).toBe(true);
    expect(validateJsonLab(json("POST", "/api/notes", { title: " " })).passed).toBe(false);
  });

  it("Cookie 实验：唯一满足五个场景的是 Path=/ + Secure + HttpOnly + Lax", () => {
    expect(evaluateCookie(COOKIE_INITIAL).passed).toBe(false);
    const good = { path: "/", secure: true, httpOnly: true, sameSite: "Lax" };
    expect(validateCookieLab(good).passed).toBe(true);
    for (const change of [{ path: "/account" }, { secure: false }, { httpOnly: false }, { sameSite: "Strict" }, { sameSite: "None" }]) {
      expect(validateCookieLab({ ...good, ...change }).passed).toBe(false);
    }
    expect(validateCookieLab({ ...good, path: "/evil" }).passed).toBe(false);
  });

  it("缓存实验：初始配置会看到过期内容，合理策略全部达标", () => {
    const initial = simulateCache(CACHE_INITIAL);
    expect(initial.passed).toBe(false);
    expect(initial.goals.find((goal) => goal.id === "fresh")?.ok).toBe(false);
    const good = { html: "no-cache", js: "max-age=31536000, immutable", loans: "no-store" };
    expect(validateCacheLab(good).passed).toBe(true);
    expect(validateCacheLab({ ...good, html: "max-age=600" }).passed).toBe(true);
    expect(validateCacheLab({ ...good, js: "max-age=600" }).passed).toBe(false);
    expect(validateCacheLab({ ...good, loans: "no-cache" }).passed).toBe(false);
    expect(validateCacheLab({ ...good, html: "max-age=31536000, immutable" }).passed).toBe(false);
  });

  it("诊断实验：逐条判断并找到根因", () => {
    const answers = Object.fromEntries(DIAGNOSIS_REQUESTS.map((item) => [item.id, item.answer]));
    expect(validateDiagnosisLab({ answers, root: "loans" }).passed).toBe(true);
    expect(validateDiagnosisLab({ answers, root: "rec" }).passed).toBe(false);
    expect(validateDiagnosisLab({ answers: { ...answers, book: "server" }, root: "loans" }).feedback.message).toContain("304");
  });

  it("综合任务：搜索 → 登录 → 借可借的那本", () => {
    const login = json("POST", "/api/session", { username: "xiaolin", password: "read-more" });
    expect(validateFinalMission({ history: [login, json("POST", "/api/loans", { bookId: 8 })] }).passed).toBe(true);
    expect(validateFinalMission({ history: [json("POST", "/api/loans", { bookId: 8 })] }).passed).toBe(false);
    expect(validateFinalMission({ history: [login, json("POST", "/api/loans", { bookId: 3 })] }).passed).toBe(false);
    expect(
      validateFinalMission({ history: [login, json("POST", "/api/loans", { bookId: 2 }), json("POST", "/api/loans", { bookId: 8 })] }).passed,
    ).toBe(false);
    expect(validateFinalMission({ history: new Array(21).fill(login) }).passed).toBe(false);
  });
});
