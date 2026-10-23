import { describe, expect, it } from "vitest";

import {
  BOOK_ETAG,
  DEFAULT_REQUEST,
  gradeDiagnosis,
  gradeMethods,
  simulateCache,
  simulateCookie,
  simulateHttp,
} from "@/content/courses/http-fundamentals/simulation/http";

describe("HTTP 课程本地模拟器", () => {
  it("读取 2 号图书返回 200，未知图书返回 404", () => {
    expect(
      simulateHttp({ ...DEFAULT_REQUEST, method: "GET", path: "/api/books/2" }).status,
    ).toBe(200);
    expect(
      simulateHttp({ ...DEFAULT_REQUEST, method: "GET", path: "/api/books/99" }).status,
    ).toBe(404);
  });

  it("创建 JSON 便签按 415 → 400 → 201 逐步校验", () => {
    const base = { ...DEFAULT_REQUEST, method: "POST" as const, path: "/api/notes" };
    expect(simulateHttp({ ...base, contentType: "text/plain", body: "{}" }).status).toBe(415);
    expect(
      simulateHttp({ ...base, contentType: "application/json", body: "{}" }).status,
    ).toBe(400);
    expect(
      simulateHttp({
        ...base,
        contentType: "application/json",
        body: '{"title":"便签"}',
      }).status,
    ).toBe(201);
  });

  it("Cookie 只有满足 Secure/HttpOnly/Path 才会被携带", () => {
    const safe = {
      setCookie: true,
      secure: true,
      httpOnly: true,
      sameSite: "Lax" as const,
      path: "/account",
    };
    expect(simulateCookie(safe).sent).toBe(true);
    expect(simulateCookie({ ...safe, path: "/wrong" }).sent).toBe(false);
    expect(simulateCookie({ ...safe, secure: false, sameSite: "None" }).accepted).toBe(false);
  });

  it("条件请求匹配 ETag 时返回 304", () => {
    expect(simulateCache(BOOK_ETAG).status).toBe(304);
    expect(simulateCache('"old"').status).toBe(200);
  });

  it("方法与诊断题库全对才通过", () => {
    expect(
      gradeMethods({ read: "GET", create: "POST", replace: "PUT", delete: "DELETE" }).passed,
    ).toBe(true);
    expect(gradeMethods({ read: "GET" }).passed).toBe(false);
    expect(gradeDiagnosis({ missing: "path", type: "media", role: "permission" }).passed).toBe(
      true,
    );
  });
});
