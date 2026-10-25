import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

import { and, eq, inArray, lt } from "drizzle-orm";
import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import { db } from "@/lib/db";
import { floatctfLogoutJti, floatctfOidcSessions, session } from "@/lib/db/schema";

/**
 * FloatCTF 标准退出在 LearnOS（RP）一侧的实现。
 *
 * 1. 登录时：Better Auth 已按 Discovery JWKS + nonce 验证 FloatCTF ID Token 后，把新建的 Better Auth 会话与
 *    FloatCTF 身份会话 `(iss, sid)` 关联起来（`floatctf_oidc_sessions`）。
 * 2. Back-Channel Logout 1.0：FloatCTF 只在用户**明确**「退出所有关联应用」时投递 Logout Token；
 *    这里严格验证后只撤销与之对应的 Better Auth 会话（不误伤其他用户或同一用户的其他设备）。
 * 3. RP-Initiated Logout 1.0：用户在 LearnOS 明确选择「退出 FloatCTF 及所有应用」时，先结束 LearnOS 会话，
 *    再把浏览器带到 FloatCTF 的确认页。普通「退出 LearnOS」从不走这里。
 */

export const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
export const LOGOUT_TOKEN_TYP = "logout+jwt";
/** Logout Token 允许的签发时间偏差与最长年龄（秒）。 */
const CLOCK_TOLERANCE_SECS = 60;
const MAX_TOKEN_AGE_SECS = 10 * 60;

// ── 登录上下文（同一请求内从 ID Token 传到会话创建钩子） ──────────────────────

export type FloatctfLoginClaims = {
  issuer: string;
  subject: string;
  sid: string | null;
  idToken: string;
};

type LoginContext = { floatctf?: FloatctfLoginClaims };

/** `/api/auth/*` 每个请求一个上下文：ID Token 只在本次 OAuth 回调内有效，不会串到别的请求。 */
export const loginContext = new AsyncLocalStorage<LoginContext>();

export function withLoginContext<T>(run: () => T): T {
  return loginContext.run({}, run);
}

/**
 * 在 genericOAuth 的 `getUserInfo` 中调用：此时 Better Auth 已经用 Discovery JWKS 与 nonce 验证过 ID Token，
 * 这里只读取其中的 `iss/sub/sid`，留给随后创建会话的钩子使用。
 */
export function rememberFloatctfLogin(idToken: string | undefined): void {
  const store = loginContext.getStore();
  if (!store || !idToken) return;
  const claims = decodeJwt(idToken);
  if (typeof claims.iss !== "string" || typeof claims.sub !== "string") return;
  store.floatctf = {
    issuer: claims.iss,
    subject: claims.sub,
    sid: typeof claims.sid === "string" ? claims.sid : null,
    idToken,
  };
}

/** `databaseHooks.session.create.after`：本次请求是 FloatCTF 登录时记录会话映射。 */
export async function recordFloatctfSession(sessionId: string): Promise<void> {
  const login = loginContext.getStore()?.floatctf;
  if (!login) return;
  await db
    .insert(floatctfOidcSessions)
    .values({
      sessionId,
      issuer: login.issuer,
      subject: login.subject,
      sid: login.sid,
      idToken: login.idToken,
    })
    .onConflictDoNothing();
}

// ── 受信任的 issuer ──────────────────────────────────────────────────────────

function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/**
 * 接受其 Logout Token 的 FloatCTF issuer：`FLOATCTF_OIDC_TRUSTED_ISSUERS`（逗号分隔，双 issuer 部署共用数据库时使用）
 * 缺省为 `FLOATCTF_OIDC_ISSUER`。显式配置，绝不从令牌里信任任意 issuer。
 */
export function trustedIssuers(): string[] {
  const raw = process.env.FLOATCTF_OIDC_TRUSTED_ISSUERS ?? process.env.FLOATCTF_OIDC_ISSUER ?? "";
  return raw
    .split(",")
    .map(normalizeIssuer)
    .filter((issuer) => issuer.length > 0);
}

const jwksByIssuer = new Map<string, JWTVerifyGetKey>();

function remoteJwks(issuer: string): JWTVerifyGetKey {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    // FloatCTF 的 jwks_uri 固定为 issuer + /.well-known/jwks.json（与 Discovery 一致）。
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

// ── Logout Token 验证 ────────────────────────────────────────────────────────

export class LogoutTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoutTokenError";
  }
}

export type VerifiedLogoutToken = {
  issuer: string;
  subject: string | null;
  sid: string | null;
  jti: string;
  expiresAt: Date;
};

export type VerifyOptions = {
  /** 期望的 `aud`（LearnOS 在 FloatCTF 登记的 client_id）。 */
  clientId?: string;
  issuers?: string[];
  /** 测试注入：按 issuer 取验签 key。 */
  getKey?: (issuer: string) => JWTVerifyGetKey;
  currentDate?: Date;
};

/**
 * 按 OpenID Connect Back-Channel Logout 1.0 §2.6 验证 Logout Token：
 * RS256 签名（issuer 的 JWKS）、`typ=logout+jwt`、iss ∈ 受信任列表、aud = client_id、iat/exp 时间窗口、
 * 含正确的 `events`、**不含** `nonce`、`jti` 存在、`sid` 或 `sub` 至少一个。
 */
export async function verifyLogoutToken(
  token: string,
  options: VerifyOptions = {},
): Promise<VerifiedLogoutToken> {
  const clientId = options.clientId ?? process.env.FLOATCTF_OIDC_CLIENT_ID ?? "";
  const issuers = options.issuers ?? trustedIssuers();
  if (!clientId || issuers.length === 0) {
    throw new LogoutTokenError("FloatCTF OIDC 未配置");
  }
  if (typeof token !== "string" || token.length === 0 || token.length > 8192) {
    throw new LogoutTokenError("logout_token 缺失或过长");
  }

  let header: ReturnType<typeof decodeProtectedHeader>;
  let unverified: JWTPayload;
  try {
    header = decodeProtectedHeader(token);
    unverified = decodeJwt(token);
  } catch {
    throw new LogoutTokenError("logout_token 不是合法的 JWT");
  }
  if (header.alg !== "RS256") throw new LogoutTokenError("不支持的签名算法");
  if (header.typ !== LOGOUT_TOKEN_TYP) throw new LogoutTokenError("typ 必须为 logout+jwt");
  const issuer = typeof unverified.iss === "string" ? normalizeIssuer(unverified.iss) : "";
  if (!issuers.includes(issuer)) throw new LogoutTokenError("issuer 不受信任");

  let payload: JWTPayload;
  try {
    const getKey = options.getKey ? options.getKey(issuer) : remoteJwks(issuer);
    ({ payload } = await jwtVerify(token, getKey, {
      issuer: unverified.iss as string,
      audience: clientId,
      algorithms: ["RS256"],
      typ: LOGOUT_TOKEN_TYP,
      clockTolerance: CLOCK_TOLERANCE_SECS,
      maxTokenAge: MAX_TOKEN_AGE_SECS,
      requiredClaims: ["iat", "exp", "jti", "events"],
      currentDate: options.currentDate,
    }));
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) throw new LogoutTokenError("logout_token 已过期");
    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      throw new LogoutTokenError(`logout_token 声明无效：${error.claim}`);
    }
    throw new LogoutTokenError("logout_token 签名无效");
  }

  const events = payload.events as Record<string, unknown> | undefined;
  const event = events?.[BACKCHANNEL_EVENT];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new LogoutTokenError("events 缺少 back-channel logout 事件");
  }
  if ("nonce" in payload) throw new LogoutTokenError("logout_token 不得包含 nonce");
  const sid = typeof payload.sid === "string" && payload.sid.length > 0 ? payload.sid : null;
  const subject = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  if (!sid && !subject) throw new LogoutTokenError("logout_token 必须包含 sid 或 sub");
  if (typeof payload.jti !== "string" || payload.jti.length === 0 || payload.jti.length > 256) {
    throw new LogoutTokenError("jti 无效");
  }
  return {
    issuer,
    subject,
    sid,
    jti: payload.jti,
    expiresAt: new Date((payload.exp as number) * 1000),
  };
}

// ── 撤销 ─────────────────────────────────────────────────────────────────────

/**
 * 记录 jti；已处理过（重放）返回 false。过期的 jti 记录顺手清理。
 */
export async function claimJti(token: VerifiedLogoutToken): Promise<boolean> {
  await db.delete(floatctfLogoutJti).where(lt(floatctfLogoutJti.expiresAt, new Date()));
  // 至少保留到令牌最长年龄之后，防止重放窗口内被提前清理。
  const keepUntil = new Date(Math.max(token.expiresAt.getTime(), Date.now() + MAX_TOKEN_AGE_SECS * 1000));
  const inserted = await db
    .insert(floatctfLogoutJti)
    .values({ issuer: token.issuer, jti: token.jti, expiresAt: keepUntil })
    .onConflictDoNothing()
    .returning({ jti: floatctfLogoutJti.jti });
  return inserted.length === 1;
}

/**
 * 撤销与 Logout Token 对应的 Better Auth 会话，返回撤销数量。
 *
 * - 有 `sid`：只撤销 `(iss, sid)` 对应的会话（同时有 `sub` 时还必须匹配 sub）；
 * - 只有 `sub`：按规范撤销该用户经该 issuer 建立的全部会话；
 * - 直接删除 `session` 行：LearnOS 未开启 Better Auth cookie cache / secondary storage，删除后 `getSession` 立即失效。
 */
export async function revokeSessionsFor(token: VerifiedLogoutToken): Promise<number> {
  const conditions = [eq(floatctfOidcSessions.issuer, token.issuer)];
  if (token.sid) conditions.push(eq(floatctfOidcSessions.sid, token.sid));
  if (token.subject) conditions.push(eq(floatctfOidcSessions.subject, token.subject));
  const rows = await db
    .select({ sessionId: floatctfOidcSessions.sessionId })
    .from(floatctfOidcSessions)
    .where(and(...conditions));
  if (rows.length === 0) return 0;
  const deleted = await db
    .delete(session)
    .where(inArray(session.id, rows.map((r) => r.sessionId)))
    .returning({ id: session.id });
  return deleted.length;
}

// ── RP-Initiated Logout ──────────────────────────────────────────────────────

export type FloatctfSessionLink = {
  issuer: string;
  idToken: string;
};

/** 当前 Better Auth 会话是否经 FloatCTF 建立（是则返回 id_token_hint 所需信息）。 */
export async function floatctfLinkForSession(sessionId: string): Promise<FloatctfSessionLink | null> {
  const [row] = await db
    .select({ issuer: floatctfOidcSessions.issuer, idToken: floatctfOidcSessions.idToken })
    .from(floatctfOidcSessions)
    .where(eq(floatctfOidcSessions.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}

export const LOGOUT_STATE_COOKIE = "learnos_floatctf_logout_state";
export const SIGNED_OUT_PATH = "/auth/signed-out";

export function newLogoutState(): string {
  return randomBytes(24).toString("base64url");
}

/** FloatCTF `end_session_endpoint` 地址（参数按 RP-Initiated Logout 1.0 §2）。 */
export function endSessionUrl(input: {
  issuer: string;
  idToken: string;
  clientId: string;
  postLogoutRedirectUri: string;
  state: string;
}): string {
  const url = new URL(`${input.issuer}/oauth/end-session`);
  url.searchParams.set("id_token_hint", input.idToken);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("post_logout_redirect_uri", input.postLogoutRedirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}
