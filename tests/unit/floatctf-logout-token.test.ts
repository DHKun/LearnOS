import { describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTPayload } from "jose";

import {
  BACKCHANNEL_EVENT,
  LogoutTokenError,
  endSessionUrl,
  verifyLogoutToken,
} from "@/lib/auth/floatctf-logout";

/**
 * Logout Token 验证（OpenID Connect Back-Channel Logout 1.0 §2.6）：
 * 只接受受信任 issuer 用 RS256 + typ=logout+jwt 签发、aud 为本应用、时间窗口内、
 * events 正确、无 nonce、带 jti 且带 sid 或 sub 的令牌。任何一项不满足都拒绝。
 */

const ISSUER = "https://ctf.example.com";
const CLIENT = "fctf_learnos";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const getKey = () => createLocalJWKSet({ keys: [jwk] });
const other = await generateKeyPair("RS256");

function claims(extra: JWTPayload = {}): JWTPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: CLIENT,
    iat: now,
    exp: now + 120,
    jti: `jti-${Math.random().toString(36).slice(2)}`,
    sid: "sid-1",
    sub: "user-1",
    events: { [BACKCHANNEL_EVENT]: {} },
    ...extra,
  };
}

async function sign(payload: JWTPayload, opts: { typ?: string; alg?: string; key?: CryptoKey } = {}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: "k1", typ: opts.typ ?? "logout+jwt" })
    .sign(opts.key ?? privateKey);
}

const verify = (token: string) =>
  verifyLogoutToken(token, { clientId: CLIENT, issuers: [ISSUER], getKey });

describe("verifyLogoutToken", () => {
  it("accepts a well-formed token and returns iss / sid / sub / jti", async () => {
    const c = claims();
    const result = await verify(await sign(c));
    expect(result.issuer).toBe(ISSUER);
    expect(result.sid).toBe("sid-1");
    expect(result.subject).toBe("user-1");
    expect(result.jti).toBe(c.jti);
  });

  it("accepts sid-only and sub-only tokens", async () => {
    const { sub: _sub, ...sidOnly } = claims();
    expect((await verify(await sign(sidOnly))).subject).toBeNull();
    const { sid: _sid, ...subOnly } = claims();
    expect((await verify(await sign(subOnly))).sid).toBeNull();
  });

  const rejects = async (token: string, pattern: RegExp) => {
    await expect(verify(token)).rejects.toBeInstanceOf(LogoutTokenError);
    await expect(verify(token)).rejects.toThrow(pattern);
  };

  it("rejects forged signatures, other keys and wrong algorithms", async () => {
    await rejects(await sign(claims(), { key: other.privateKey }), /签名/);
    const token = await sign(claims());
    const [h, p] = token.split(".");
    await rejects(`${h}.${p}.AAAA`, /签名/);
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "logout+jwt" })).toString("base64url")}.${p}.`;
    await rejects(none, /算法/);
  });

  it("rejects a token that is not typed logout+jwt (e.g. an ID Token replayed)", async () => {
    await rejects(await sign(claims(), { typ: "JWT" }), /typ/);
  });

  it("rejects untrusted issuers and wrong audiences", async () => {
    await rejects(await sign(claims({ iss: "https://evil.example" })), /issuer/);
    await rejects(await sign(claims({ aud: "another-client" })), /aud/);
  });

  it("rejects expired, future-dated and too old tokens", async () => {
    const now = Math.floor(Date.now() / 1000);
    await rejects(await sign(claims({ iat: now - 600, exp: now - 300 })), /过期/);
    await rejects(await sign(claims({ iat: now + 3600, exp: now + 3720 })), /iat/);
    // 超过最长年龄（10 分钟）同样按过期拒绝
    await rejects(await sign(claims({ iat: now - 3600, exp: now + 3600 })), /过期/);
  });

  it("rejects missing or malformed events, nonce, jti and identifiers", async () => {
    await rejects(await sign(claims({ events: { "urn:other": {} } })), /events/);
    await rejects(await sign(claims({ events: { [BACKCHANNEL_EVENT]: "yes" } })), /events/);
    await rejects(await sign(claims({ nonce: "n" })), /nonce/);
    const { jti: _jti, ...noJti } = claims();
    await rejects(await sign(noJti), /jti/);
    const { sid: _s, sub: _u, ...anonymous } = claims();
    await rejects(await sign(anonymous), /sid 或 sub/);
  });

  it("rejects garbage and oversized input without throwing unexpected errors", async () => {
    await rejects("not-a-jwt", /JWT/);
    await rejects("a".repeat(9000), /过长/);
  });
});

describe("endSessionUrl", () => {
  it("builds a standard RP-Initiated Logout request", () => {
    const url = new URL(
      endSessionUrl({
        issuer: ISSUER,
        idToken: "id.token.value",
        clientId: CLIENT,
        postLogoutRedirectUri: "https://learn.example.com/auth/signed-out",
        state: "s1",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/oauth/end-session`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id_token_hint: "id.token.value",
      client_id: CLIENT,
      post_logout_redirect_uri: "https://learn.example.com/auth/signed-out",
      state: "s1",
    });
  });
});
