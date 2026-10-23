import { describe, expect, it } from "vitest";

import {
  validateCacheConsole,
  validateCookieConsole,
  validateFinalMission,
  validateJsonConsole,
  validateMethodMatcher,
  validateRequestConsole,
} from "@/content/courses/http-fundamentals/validators";

describe("HTTP 课程服务端校验器", () => {
  it("请求工作台只接受 GET /api/books/2 并返回 200", () => {
    expect(validateRequestConsole({ method: "GET", path: "/api/books/2" }).passed).toBe(true);
    expect(validateRequestConsole({ method: "GET", path: "/api/books/99" }).passed).toBe(false);
    expect(validateRequestConsole({ method: "POST", path: "/api/books/2" }).passed).toBe(false);
  });

  it("忽略客户端伪造的 passed 字段", () => {
    expect(validateRequestConsole({ method: "GET", path: "/api/books/99", passed: true }).passed).toBe(
      false,
    );
  });

  it("方法匹配必须四项全部正确", () => {
    const correct = { answers: { read: "GET", create: "POST", replace: "PUT", delete: "DELETE" } };
    expect(validateMethodMatcher(correct).passed).toBe(true);
    expect(
      validateMethodMatcher({ answers: { ...correct.answers, create: "PUT" } }).passed,
    ).toBe(false);
  });

  it("JSON 便签要求 POST、JSON Content-Type 和非空 title", () => {
    const valid = {
      method: "POST",
      path: "/api/notes",
      contentType: "application/json",
      body: '{"title":"学习笔记"}',
    };
    expect(validateJsonConsole(valid).passed).toBe(true);
    expect(validateJsonConsole({ ...valid, contentType: "text/plain" }).passed).toBe(false);
    expect(validateJsonConsole({ ...valid, body: '{"title":""}' }).passed).toBe(false);
  });

  it("Cookie 配置要求 Secure、HttpOnly、SameSite=Lax 且 Path 匹配", () => {
    const valid = {
      setCookie: true,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      path: "/account",
    };
    expect(validateCookieConsole(valid).passed).toBe(true);
    expect(validateCookieConsole({ ...valid, secure: false }).passed).toBe(false);
    expect(validateCookieConsole({ ...valid, path: "/wrong" }).passed).toBe(false);
  });

  it("ETag 条件请求只有填写正确 ETag 才通过", () => {
    expect(validateCacheConsole({ ifNoneMatch: '"book-v1"' }).passed).toBe(true);
    expect(validateCacheConsole({ ifNoneMatch: '"old-version"' }).passed).toBe(false);
  });

  it("综合任务三项全部通过才通过", () => {
    const tasks = [
      { method: "GET", path: "/api/books/2" },
      { method: "POST", path: "/api/notes", contentType: "application/json", body: '{"title":"便签"}' },
      { method: "GET", path: "/api/profile", cookie: "session=learnos-demo" },
    ];
    expect(validateFinalMission({ tasks }).passed).toBe(true);
    expect(validateFinalMission({ tasks: tasks.slice(0, 2) }).passed).toBe(false);
    expect(validateFinalMission({ tasks: [tasks[0], tasks[1], { ...tasks[2], cookie: "" }] }).passed).toBe(
      false,
    );
  });
});
