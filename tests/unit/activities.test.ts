import { describe, expect, it } from "vitest";

import {
  auditPayloads,
  validateSqlDefences,
} from "@/lib/activities/sql-injection";
import {
  simulateIdempotency,
  validateIdempotencyConfig,
} from "@/lib/activities/idempotency";

describe("SQL injection simulation", () => {
  it("参数化阻止全部载荷", () => {
    expect(auditPayloads(["parameterize"]).every((result) => result.blocked)).toBe(true);
    expect(validateSqlDefences(["parameterize"]).passed).toBe(true);
  });

  it("单点措施只覆盖对应上下文", () => {
    const results = auditPayloads(["type-cast"]);
    expect(results.find((result) => result.id === "numeric")?.blocked).toBe(true);
    expect(results.find((result) => result.id === "classic")?.blocked).toBe(false);
    expect(validateSqlDefences(["type-cast"]).passed).toBe(false);
  });

  it("空防御不能通过", () => {
    expect(validateSqlDefences([]).passed).toBe(false);
  });
});

describe("idempotency simulation", () => {
  const safe = {
    keyStrategy: "stable" as const,
    retryPolicy: "same-key" as const,
    dedupe: true,
    maxRetries: 3,
  };

  it("稳定键 + 去重只扣款一次", () => {
    const result = simulateIdempotency(safe);
    expect(result.charges).toBe(1);
    expect(result.dedupeEffective).toBe(true);
    expect(validateIdempotencyConfig(safe).passed).toBe(true);
  });

  it("新键重试导致重复扣款", () => {
    const result = simulateIdempotency({ ...safe, retryPolicy: "new-key" });
    expect(result.charges).toBeGreaterThan(1);
    expect(validateIdempotencyConfig({ ...safe, retryPolicy: "new-key" }).passed).toBe(false);
  });

  it("重试预算不足会放弃", () => {
    const result = validateIdempotencyConfig({ ...safe, maxRetries: 0 });
    expect(result.simulation.gaveUp).toBe(true);
    expect(result.passed).toBe(false);
  });
});
