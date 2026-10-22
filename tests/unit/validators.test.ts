import { describe, expect, it } from "vitest";

import { validateIdempotencyLab } from "@/content/courses/idempotent-retries/validators";
import { validateSqlInjectionLab } from "@/content/courses/sql-injection-basics/validators";

describe("SQL 注入实验服务端校验器", () => {
  it("参数化查询通过并阻止所有载荷", () => {
    const result = validateSqlInjectionLab({ defences: ["parameterize"] });
    expect(result.passed).toBe(true);
    expect(result.feedback.results.every((item) => item.blocked)).toBe(true);
  });

  it("只转义引号无法阻止数值注入", () => {
    const result = validateSqlInjectionLab({ defences: ["escape-quotes"] });
    expect(result.passed).toBe(false);
    expect(result.feedback.results.find((item) => item.id === "numeric")?.blocked).toBe(false);
  });

  it("组合措施（转义 + 类型转换 + 去注释）同样可以通过", () => {
    const result = validateSqlInjectionLab({
      defences: ["escape-quotes", "type-cast", "strip-comments"],
    });
    expect(result.passed).toBe(true);
  });

  it("拒绝空、未知或伪造的防御列表", () => {
    expect(validateSqlInjectionLab({ defences: [] }).passed).toBe(false);
    expect(validateSqlInjectionLab({ defences: ["magic-wand"] }).passed).toBe(false);
    expect(validateSqlInjectionLab(null).passed).toBe(false);
    expect(validateSqlInjectionLab({ defences: [123] }).passed).toBe(false);
  });

  it("忽略客户端伪造的 passed 字段", () => {
    const result = validateSqlInjectionLab({ defences: [], passed: true });
    expect(result.passed).toBe(false);
  });
});

describe("幂等重试实验服务端校验器", () => {
  const valid = {
    keyStrategy: "stable",
    retryPolicy: "same-key",
    dedupe: true,
    maxRetries: 3,
  };

  it("稳定键 + 去重 + 足够重试预算通过，只扣款一次", () => {
    const result = validateIdempotencyLab(valid);
    expect(result.passed).toBe(true);
    expect(result.feedback.charges).toBe(1);
    expect(result.feedback.suppressed).toBeGreaterThan(0);
  });

  it("每次重试新键导致重复扣款", () => {
    const result = validateIdempotencyLab({ ...valid, retryPolicy: "new-key" });
    expect(result.passed).toBe(false);
    expect(result.feedback.charges).toBeGreaterThan(1);
  });

  it("没有服务端去重存储导致重复扣款", () => {
    const result = validateIdempotencyLab({ ...valid, dedupe: false });
    expect(result.passed).toBe(false);
  });

  it("重试预算不足时客户端在成功前放弃", () => {
    const result = validateIdempotencyLab({ ...valid, maxRetries: 2 });
    expect(result.passed).toBe(false);
    expect(result.feedback.message).toContain("重试预算不足");
  });

  it("拒绝越界或伪造参数", () => {
    expect(validateIdempotencyLab({ ...valid, maxRetries: 99 }).passed).toBe(false);
    expect(validateIdempotencyLab({ ...valid, keyStrategy: "magic" }).passed).toBe(false);
    expect(validateIdempotencyLab({ ...valid, dedupe: "yes" }).passed).toBe(false);
    expect(validateIdempotencyLab(null).passed).toBe(false);
  });
});
