import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { floatctfLinkRequest, floatctfSignInRequest } from "@/lib/auth/floatctf-request";

/**
 * 用 LearnOS 真实的 Better Auth 实例（lib/auth/better.ts，genericOAuth + PKCE + Discovery）
 * 和真实 PostgreSQL 验证：
 * - 主动登录 / 绑定发出的授权请求带 prompt=select_account，且 state / PKCE / redirect_uri
 *   仍由 Better Auth 生成、不能被 additionalParams 覆盖；
 * - 退出 LearnOS 成功时会话确实失效，失败时不报告成功。
 *
 * FloatCTF 端只用一个本地 Discovery 桩（授权 URL 的构造不需要访问 OP 的其他端点）；
 * 真实 OP 的端到端行为由 tests/e2e/floatctf-account-chooser.spec.ts 覆盖。
 */

const APP = "http://127.0.0.1:3010";
let discovery: http.Server;
let issuer = "";
let auth: (typeof import("@/lib/auth/better"))["auth"];
let signOutLearnOS: (typeof import("@/lib/auth/sign-out"))["signOutLearnOS"];
let pool: (typeof import("@/lib/db"))["pool"];
const createdEmails: string[] = [];

beforeAll(async () => {
  discovery = http.createServer((req, res) => {
    if (req.url === "/.well-known/openid-configuration") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          userinfo_endpoint: `${issuer}/oauth/userinfo`,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => discovery.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(discovery.address() as AddressInfo).port}`;

  // lib/auth/better.ts 在模块加载时读取配置，所以先设好环境再动态导入。
  process.env.FLOATCTF_OIDC_ISSUER = issuer;
  process.env.FLOATCTF_OIDC_CLIENT_ID = "fctf_learnos_test";
  process.env.FLOATCTF_OIDC_CLIENT_SECRET = "fcs_learnos_test_secret";
  process.env.BETTER_AUTH_URL = APP;
  process.env.BETTER_AUTH_SECRET = "learnos-integration-test-secret-0123456789";
  process.env.BETTER_AUTH_ALLOW_SIGNUP = "true";
  process.env.BETTER_AUTH_RATE_LIMIT = "false";
  ({ auth } = await import("@/lib/auth/better"));
  ({ signOutLearnOS } = await import("@/lib/auth/sign-out"));
  ({ pool } = await import("@/lib/db"));
});

afterAll(async () => {
  if (createdEmails.length) {
    await pool.query(
      'delete from public.profiles where user_id in (select id from public."user" where email = any($1))',
      [createdEmails],
    );
    await pool.query('delete from public."user" where email = any($1)', [createdEmails]);
  }
  await new Promise<void>((resolve) => discovery.close(() => resolve()));
});

/** 建一个 LearnOS 邮箱账号并返回带会话 Cookie 的请求头。 */
async function signedInHeaders(): Promise<{ headers: Headers; userId: string }> {
  const email = `it-floatctf-${randomUUID().slice(0, 8)}@learnos.local`;
  createdEmails.push(email);
  const response = await auth.api.signUpEmail({
    body: { email, password: "Integration-Test-2026!", name: "IT FloatCTF" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const body = (await response.json()) as { user: { id: string } };
  return { headers: new Headers({ cookie }), userId: body.user.id };
}

function expectBetterAuthOwnsProtocolParams(url: URL) {
  expect(url.origin + url.pathname).toBe(`${issuer}/oauth/authorize`);
  const q = url.searchParams;
  expect(q.get("prompt")).toBe("select_account");
  expect(q.get("response_type")).toBe("code");
  expect(q.get("client_id")).toBe("fctf_learnos_test");
  expect(q.get("redirect_uri")).toBe(`${APP}/api/auth/callback/floatctf`);
  expect(q.get("code_challenge_method")).toBe("S256");
  expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(q.get("state")?.length ?? 0).toBeGreaterThanOrEqual(16);
  expect(q.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["openid", "profile"]));
  // 每个参数只出现一次（FloatCTF 对重复参数一律 invalid_request）
  const names = [...q.keys()];
  expect(new Set(names).size).toBe(names.length);
}

describe("FloatCTF 授权请求（真实 Better Auth 配置）", () => {
  it("主动登录带 prompt=select_account，协议参数仍由 Better Auth 生成", async () => {
    const result = await auth.api.signInSocial({
      body: floatctfSignInRequest(APP, "/courses"),
    });
    expect(result.redirect).toBe(true);
    expectBetterAuthOwnsProtocolParams(new URL(result.url!));
  });

  it("additionalParams 不能覆盖 state / PKCE / redirect_uri 等保留参数", async () => {
    // 安装版本（better-auth 1.7.12）直接拒绝这类请求，而不是静默丢弃。
    const forged = floatctfSignInRequest(APP);
    for (const [key, value] of [
      ["state", "attacker-state"],
      ["redirect_uri", "https://evil.example/cb"],
      ["code_challenge", "attacker"],
      ["client_id", "other-client"],
      ["nonce", "attacker-nonce"],
    ]) {
      await expect(
        auth.api.signInSocial({
          body: { ...forged, additionalParams: { ...forged.additionalParams, [key]: value } },
        }),
      ).rejects.toThrow(/reserved OAuth parameters/);
    }
  });

  it("显式绑定同样带 prompt=select_account", async () => {
    const { headers } = await signedInHeaders();
    const result = await auth.api.linkSocialAccount({
      headers,
      body: floatctfLinkRequest(APP),
    });
    expectBetterAuthOwnsProtocolParams(new URL(result.url));
  });
});

describe("退出 LearnOS", () => {
  it("成功时 Better Auth 会话在服务端确实失效", async () => {
    const { headers, userId } = await signedInHeaders();
    expect(await auth.api.getSession({ headers })).not.toBeNull();

    await expect(signOutLearnOS(headers)).resolves.toEqual({ ok: true });
    expect(await auth.api.getSession({ headers })).toBeNull();
    const { rows } = await pool.query("select count(*)::int as n from public.session where user_id = $1", [
      userId,
    ]);
    expect(rows[0].n).toBe(0);
    // 已退出后再次退出是幂等的
    await expect(signOutLearnOS(headers)).resolves.toEqual({ ok: true });
  });

  it("Better Auth 退出抛错时不报告成功，会话保留", async () => {
    const { headers } = await signedInHeaders();
    const spy = vi.spyOn(auth.api, "signOut").mockRejectedValueOnce(new Error("database unavailable"));
    try {
      await expect(signOutLearnOS(headers)).resolves.toEqual({ ok: false });
    } finally {
      spy.mockRestore();
    }
    expect(await auth.api.getSession({ headers })).not.toBeNull();
  });

  it("Better Auth 报告成功但会话仍然有效（删除被吞掉）时不报告成功", async () => {
    const { headers } = await signedInHeaders();
    const spy = vi.spyOn(auth.api, "signOut").mockResolvedValueOnce({ success: true } as never);
    try {
      await expect(signOutLearnOS(headers)).resolves.toEqual({ ok: false });
    } finally {
      spy.mockRestore();
    }
    expect(await auth.api.getSession({ headers })).not.toBeNull();
  });
});
