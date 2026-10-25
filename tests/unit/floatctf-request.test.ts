import { describe, expect, it } from "vitest";

import {
  FLOATCTF_INTERACTIVE_AUTH_PARAMS,
  callbackFailurePath,
  floatctfLinkRequest,
  floatctfSignInRequest,
  safeNextPath,
} from "@/lib/auth/floatctf-request";

const ORIGIN = "https://learn.example.com";
const RESERVED = [
  "state",
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "nonce",
  "scope",
];

describe("FloatCTF 主动登录 / 绑定请求", () => {
  it("登录按钮请求 prompt=select_account，且不触碰协议保留参数", () => {
    const request = floatctfSignInRequest(ORIGIN, "/learn/abc");
    expect(request.provider).toBe("floatctf");
    expect(request.additionalParams).toEqual({ prompt: "select_account" });
    for (const key of RESERVED) expect(request.additionalParams).not.toHaveProperty(key);
    const callback = new URL(request.callbackURL);
    expect(callback.origin).toBe(ORIGIN);
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/learn/abc");
    // 失败/取消回到 LearnOS 自己的回调页处理，而不是 Better Auth 的通用错误页
    expect(request.errorCallbackURL).toBe("/auth/callback");
  });

  it("绑定按钮同样要求在 FloatCTF 确认账号", () => {
    const request = floatctfLinkRequest(ORIGIN);
    expect(request.additionalParams).toEqual({ prompt: "select_account" });
    const callback = new URL(request.callbackURL);
    expect(callback.searchParams.get("intent")).toBe("link");
    expect(callback.searchParams.get("next")).toBe("/account/connections");
    expect(request.errorCallbackURL).toBe("/auth/callback?intent=link");
  });

  it("每次返回独立对象，调用方无法篡改共享常量", () => {
    const a = floatctfSignInRequest(ORIGIN);
    a.additionalParams.prompt = "none";
    expect(floatctfSignInRequest(ORIGIN).additionalParams.prompt).toBe("select_account");
    expect(Object.isFrozen(FLOATCTF_INTERACTIVE_AUTH_PARAMS)).toBe(true);
  });

  it("next 只接受站内相对路径（防开放重定向）", () => {
    for (const unsafe of ["https://evil.example/x", "//evil.example", "/\\evil.example", "/a\nb", "", null]) {
      expect(safeNextPath(unsafe)).toBeNull();
      const callback = new URL(floatctfSignInRequest(ORIGIN, unsafe).callbackURL);
      expect(callback.searchParams.has("next")).toBe(false);
      expect(callback.origin).toBe(ORIGIN);
    }
    expect(safeNextPath("/courses?x=1")).toBe("/courses?x=1");
  });
});

describe("/auth/callback 失败去向", () => {
  it("在 FloatCTF 取消登录与其他失败区分开", () => {
    expect(callbackFailurePath({ error: "access_denied", intent: null, signedIn: false })).toBe(
      "/login?reason=oauth_denied",
    );
    expect(callbackFailurePath({ error: "invalid_grant", intent: null, signedIn: false })).toBe(
      "/login?reason=oauth_failed",
    );
    expect(callbackFailurePath({ error: null, intent: null, signedIn: false })).toBe(
      "/login?reason=oauth_failed",
    );
  });

  it("绑定失败保留当前登录，并区分取消", () => {
    expect(callbackFailurePath({ error: "access_denied", intent: "link", signedIn: true })).toBe(
      "/account/connections?error=link_cancelled",
    );
    expect(
      callbackFailurePath({
        error: "account_already_linked_to_different_user",
        intent: "link",
        signedIn: true,
      }),
    ).toBe("/account/connections?error=link_failed");
    expect(callbackFailurePath({ error: "access_denied", intent: "link", signedIn: false })).toBe(
      "/login?reason=link_failed",
    );
  });
});
