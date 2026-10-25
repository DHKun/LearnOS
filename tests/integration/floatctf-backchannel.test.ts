import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { SignJWT, exportJWK, generateKeyPair, type JWTPayload } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Back-Channel Logout 1.0 在 LearnOS 的真实行为（真实 Better Auth 会话 + 真实 PostgreSQL + 本地 JWKS 桩）：
 * - 合法 Logout Token 只撤销 (iss, sid) 对应的会话：同一用户其他设备、其他用户都不受影响；
 * - 撤销后 getSession（绕过 cookie cache）立即失效——不是只删映射表；
 * - 重放 jti、错误 aud、错误签名、不受信 issuer 都被拒绝且不删任何会话；
 * - 只带 sub 的令牌按规范撤销该用户经该 issuer 的全部会话；
 * - 登录上下文只把本次请求验证过的 ID Token 关联到本次创建的会话；
 * - 普通「退出 LearnOS」即使 OP 宣告了 end_session_endpoint 也不发起 RP-Initiated Logout。
 */

const APP = "http://127.0.0.1:3010";
const CLIENT = "fctf_learnos_bc_test";
let stub: http.Server;
let issuer = "";
let jwks: { keys: unknown[] } = { keys: [] };
const { privateKey, publicKey } = await generateKeyPair("RS256");

let auth: (typeof import("@/lib/auth/better"))["auth"];
let POST: (typeof import("@/app/api/oidc/backchannel-logout/route"))["POST"];
let logout: typeof import("@/lib/auth/floatctf-logout");
let pool: (typeof import("@/lib/db"))["pool"];
const createdEmails: string[] = [];

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/.well-known/jwks.json") {
      res.end(JSON.stringify(jwks));
      return;
    }
    if (req.url === "/.well-known/openid-configuration") {
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          userinfo_endpoint: `${issuer}/oauth/userinfo`,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          end_session_endpoint: `${issuer}/oauth/end-session`,
          backchannel_logout_supported: true,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "bc-1", alg: "RS256", use: "sig" }] };

  process.env.FLOATCTF_OIDC_ISSUER = issuer;
  process.env.FLOATCTF_OIDC_TRUSTED_ISSUERS = issuer;
  process.env.FLOATCTF_OIDC_CLIENT_ID = CLIENT;
  process.env.FLOATCTF_OIDC_CLIENT_SECRET = "fcs_bc_test_secret";
  process.env.BETTER_AUTH_URL = APP;
  process.env.BETTER_AUTH_SECRET = "learnos-integration-test-secret-0123456789";
  process.env.BETTER_AUTH_ALLOW_SIGNUP = "true";
  process.env.BETTER_AUTH_RATE_LIMIT = "false";
  ({ auth } = await import("@/lib/auth/better"));
  ({ POST } = await import("@/app/api/oidc/backchannel-logout/route"));
  logout = await import("@/lib/auth/floatctf-logout");
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
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

type Signed = { headers: Headers; userId: string; sessionId: string };

/** 建一个账号并登录一次（返回带会话 Cookie 的请求头与会话 id）。 */
async function newUser(): Promise<{ email: string; first: Signed }> {
  const email = `it-bc-${randomUUID().slice(0, 8)}@learnos.local`;
  createdEmails.push(email);
  const response = await auth.api.signUpEmail({
    body: { email, password: "Integration-Test-2026!", name: "IT Backchannel" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return { email, first: await toSigned(response) };
}

async function signInAgain(email: string): Promise<Signed> {
  const response = await auth.api.signInEmail({
    body: { email, password: "Integration-Test-2026!" },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  return toSigned(response);
}

async function toSigned(response: Response): Promise<Signed> {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const headers = new Headers({ cookie });
  const current = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  return { headers, userId: current!.user.id, sessionId: current!.session.id };
}

async function link(s: Signed, sid: string | null, sub = s.userId) {
  await pool.query(
    "insert into public.floatctf_oidc_sessions (session_id, issuer, subject, sid, id_token) values ($1, $2, $3, $4, 'test.id.token')",
    [s.sessionId, issuer, sub, sid],
  );
}

async function alive(s: Signed): Promise<boolean> {
  return (await auth.api.getSession({ headers: s.headers, query: { disableCookieCache: true } })) !== null;
}

async function token(extra: JWTPayload = {}, key = privateKey, typ = "logout+jwt") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    aud: CLIENT,
    iat: now,
    exp: now + 120,
    jti: randomUUID(),
    events: { [logout.BACKCHANNEL_EVENT]: {} },
    ...extra,
  })
    .setProtectedHeader({ alg: "RS256", kid: "bc-1", typ })
    .sign(key);
}

function deliver(logoutToken: string, contentType = "application/x-www-form-urlencoded") {
  return POST(
    new Request(`${APP}/api/oidc/backchannel-logout`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: new URLSearchParams({ logout_token: logoutToken }).toString(),
    }),
  );
}

describe("Back-Channel Logout 接收端", () => {
  it("只撤销 sid 对应的会话，且撤销后会话立即失效", async () => {
    const alice = await newUser();
    const aliceOtherDevice = await signInAgain(alice.email);
    const bob = await newUser();
    await link(alice.first, "sid-alice-1");
    await link(aliceOtherDevice, "sid-alice-2");
    await link(bob.first, "sid-bob-1");

    const res = await deliver(await token({ sid: "sid-alice-1", sub: alice.first.userId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await alive(alice.first)).toBe(false);
    expect(await alive(aliceOtherDevice)).toBe(true);
    expect(await alive(bob.first)).toBe(true);
    const { rows } = await pool.query("select count(*)::int as n from public.floatctf_oidc_sessions where session_id = $1", [
      alice.first.sessionId,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it("拒绝重放、错误 aud、错误签名、不受信 issuer、错误 typ 与非表单请求，且不删除任何会话", async () => {
    const carol = await newUser();
    await link(carol.first, "sid-carol");
    const valid = await token({ sid: "sid-carol" });
    const other = await generateKeyPair("RS256");
    const now = Math.floor(Date.now() / 1000);
    const bad = [
      await token({ sid: "sid-carol", aud: "someone-else" }),
      await token({ sid: "sid-carol" }, other.privateKey),
      await token({ sid: "sid-carol", iss: "https://evil.example" }),
      await token({ sid: "sid-carol" }, privateKey, "JWT"),
      await token({ sid: "sid-carol", nonce: "x" }),
      await token({ sid: "sid-carol", iat: now - 900, exp: now - 600 }),
    ];
    for (const t of bad) {
      const res = await deliver(t);
      expect(res.status).toBe(400);
    }
    expect((await deliver(valid, "application/json")).status).toBe(400);
    expect(await alive(carol.first)).toBe(true);

    expect((await deliver(valid)).status).toBe(200);
    expect(await alive(carol.first)).toBe(false);
    // 同一个 jti 重放
    expect((await deliver(valid)).status).toBe(400);
  });

  it("只带 sub 时撤销该用户经该 issuer 的全部会话，不影响别人", async () => {
    const dave = await newUser();
    const daveTablet = await signInAgain(dave.email);
    const erin = await newUser();
    await link(dave.first, "sid-dave-1");
    await link(daveTablet, "sid-dave-2");
    await link(erin.first, "sid-erin");
    const res = await deliver(await token({ sub: dave.first.userId }));
    expect(res.status).toBe(200);
    expect(await alive(dave.first)).toBe(false);
    expect(await alive(daveTablet)).toBe(false);
    expect(await alive(erin.first)).toBe(true);
  });

  it("没有对应会话（用户已在 LearnOS 退出）时返回 200", async () => {
    const res = await deliver(await token({ sid: `sid-${randomUUID()}` }));
    expect(res.status).toBe(200);
  });
});

describe("登录上下文与普通退出", () => {
  it("只把本次请求验证过的 ID Token 关联到本次创建的会话", async () => {
    const frank = await newUser();
    const idToken = await new SignJWT({ iss: issuer, sub: "fctf-user-frank", sid: "sid-frank", aud: CLIENT })
      .setProtectedHeader({ alg: "RS256", kid: "bc-1" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    // 上下文之外：不记录
    logout.rememberFloatctfLogin(idToken);
    await logout.recordFloatctfSession(frank.first.sessionId);
    expect(await logout.floatctfLinkForSession(frank.first.sessionId)).toBeNull();
    // 上下文之内：记录 (iss, sub, sid, id_token)
    await logout.withLoginContext(async () => {
      logout.rememberFloatctfLogin(idToken);
      await logout.recordFloatctfSession(frank.first.sessionId);
    });
    const { rows } = await pool.query(
      "select issuer, subject, sid, id_token from public.floatctf_oidc_sessions where session_id = $1",
      [frank.first.sessionId],
    );
    expect(rows[0]).toMatchObject({ issuer, subject: "fctf-user-frank", sid: "sid-frank", id_token: idToken });
  });

  it("OP 宣告 end_session_endpoint 后，普通退出 LearnOS 仍不发起 RP-Initiated Logout", async () => {
    const grace = await newUser();
    // 让该用户拥有 FloatCTF 账号关联（Better Auth signOut 只对有 provider 账号的用户尝试 provider logout）
    await pool.query(
      `insert into public.account (id, account_id, provider_id, user_id, id_token, created_at, updated_at)
       values (gen_random_uuid(), $1, 'floatctf', $2, 'test.id.token', now(), now())`,
      [`fctf-${randomUUID()}`, grace.first.userId],
    );
    const result = await auth.api.signOut({ headers: grace.first.headers });
    expect(result.success).toBe(true);
    expect((result as { url?: string }).url).toBeUndefined();
    expect(await alive(grace.first)).toBe(false);
  });
});
