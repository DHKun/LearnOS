import { describe, expect, it } from "vitest";

import {
  LEARNING_PROTOCOL,
  buildLabUrl,
  validateIframeMessage,
} from "@/lib/learning/bridge";

const ORIGIN = "http://localhost:4310";
const NONCE = "nonce-abc";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function message(overrides: Record<string, unknown> = {}) {
  return {
    protocol: LEARNING_PROTOCOL,
    nonce: NONCE,
    requestId: REQUEST_ID,
    type: "TRACK",
    payload: { type: "step_interacted" },
    ...overrides,
  };
}

describe("iframe 消息校验", () => {
  it("接受来源、窗口、nonce 与 schema 都正确的消息", () => {
    const result = validateIframeMessage({
      data: message(),
      origin: ORIGIN,
      expectedOrigin: ORIGIN,
      sourceMatches: true,
      expectedNonce: NONCE,
    });
    expect(result.ok).toBe(true);
  });

  it("拒绝来源不匹配", () => {
    const result = validateIframeMessage({
      data: message(),
      origin: "http://evil.example",
      expectedOrigin: ORIGIN,
      sourceMatches: true,
      expectedNonce: NONCE,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("origin-mismatch");
  });

  it("拒绝非目标 iframe 窗口的消息", () => {
    const result = validateIframeMessage({
      data: message(),
      origin: ORIGIN,
      expectedOrigin: ORIGIN,
      sourceMatches: false,
      expectedNonce: NONCE,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("source-mismatch");
  });

  it("拒绝错误 nonce", () => {
    const result = validateIframeMessage({
      data: message({ nonce: "attacker" }),
      origin: ORIGIN,
      expectedOrigin: ORIGIN,
      sourceMatches: true,
      expectedNonce: NONCE,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("nonce-mismatch");
  });

  it("拒绝错误协议版本与未知消息类型", () => {
    expect(
      validateIframeMessage({
        data: message({ protocol: "learnos/0" }),
        origin: ORIGIN,
        expectedOrigin: ORIGIN,
        sourceMatches: true,
        expectedNonce: NONCE,
      }).ok,
    ).toBe(false);

    expect(
      validateIframeMessage({
        data: message({ type: "ADMIN_OVERRIDE" }),
        origin: ORIGIN,
        expectedOrigin: ORIGIN,
        sourceMatches: true,
        expectedNonce: NONCE,
      }).ok,
    ).toBe(false);
  });

  it("拒绝缺少 requestId 或 payload 结构错误的消息", () => {
    expect(
      validateIframeMessage({
        data: message({ requestId: "not-a-uuid" }),
        origin: ORIGIN,
        expectedOrigin: ORIGIN,
        sourceMatches: true,
        expectedNonce: NONCE,
      }).ok,
    ).toBe(false);

    expect(
      validateIframeMessage({
        data: message({ payload: "not-an-object" }),
        origin: ORIGIN,
        expectedOrigin: ORIGIN,
        sourceMatches: true,
        expectedNonce: NONCE,
      }).ok,
    ).toBe(false);
  });

  it("READY 消息允许在 INIT 之前使用空 nonce", () => {
    const result = validateIframeMessage({
      data: message({ type: "READY", nonce: "", payload: { sdkVersion: "1.0.0" } }),
      origin: ORIGIN,
      expectedOrigin: ORIGIN,
      sourceMatches: true,
      expectedNonce: "",
    });
    expect(result.ok).toBe(true);
  });
});

describe("实验 URL 构造", () => {
  it("只向目标父窗口 origin 传参，不使用通配符", () => {
    const url = buildLabUrl(`${ORIGIN}/sql-injection-lab/`, "http://localhost:3000", "dark");
    const parsed = new URL(url);
    expect(parsed.origin).toBe(ORIGIN);
    expect(parsed.searchParams.get("parentOrigin")).toBe("http://localhost:3000");
    expect(parsed.searchParams.get("theme")).toBe("dark");
    expect(url).not.toContain("*");
  });
});
