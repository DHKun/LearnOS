import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { nextCookies } from "better-auth/next-js";

import { profiles } from "@/lib/db/schema";

import { db } from "@/lib/db";
import { recordFloatctfSession, rememberFloatctfLogin } from "@/lib/auth/floatctf-logout";

const issuer = (process.env.FLOATCTF_OIDC_ISSUER ?? "").replace(/\/$/, "");

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3010",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "learnos-local-development-secret-change-before-deploying",
  database: drizzleAdapter(db, { provider: "pg" }),
  account: {
    accountLinking: {
      enabled: true,
      // FloatCTF has no real email; LearnOS requires explicit, signed-in
      // linking instead of email-based automatic merging.
      allowDifferentEmails: true,
      // FloatCTF is trusted only for the explicit, signed-in link flow; its
      // placeholder emails are unique and never used for implicit matching.
      trustedProviders: ["floatctf"],
    },
  },
  rateLimit: {
    enabled: process.env.BETTER_AUTH_RATE_LIMIT !== "false",
  },
  emailAndPassword: {
    enabled: true,
    // Admin-issued accounts only; public email signup stays closed at the app layer.
    disableSignUp: process.env.BETTER_AUTH_ALLOW_SIGNUP !== "true",
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  databaseHooks: {
    session: {
      create: {
        // 经 FloatCTF 登录时把会话与 FloatCTF 身份会话 (iss, sid) 关联（Back-Channel Logout 用）。
        after: async (created) => {
          await recordFloatctfSession(created.id);
        },
      },
    },
    user: {
      create: {
        after: async (user) => {
          // New identities are always students. Admin elevation happens only
          // through LearnOS' own controlled management flow.
          await db
            .insert(profiles)
            .values({
              userId: user.id,
              email: user.email ?? null,
              displayName: (user.name || user.email || `用户 ${user.id.slice(0, 8)}`).slice(0, 120),
              role: "student",
            })
            .onConflictDoNothing();
        },
      },
    },
  },
  plugins: [
    genericOAuth({
      config: issuer
        ? [
            {
              providerId: "floatctf",
              name: "FloatCTF",
              discoveryUrl: `${issuer}/.well-known/openid-configuration`,
              clientId: process.env.FLOATCTF_OIDC_CLIENT_ID ?? "",
              clientSecret: process.env.FLOATCTF_OIDC_CLIENT_SECRET ?? "",
              scopes: ["openid", "profile"],
              pkce: true,
              authentication: "post",
              disableImplicitSignUp: false,
              // ID Token 必须按 Discovery JWKS 验签（Back-Channel Logout 依赖其中的 sid）。
              requireIdTokenVerification: true,
              // 普通「退出 LearnOS」只结束 LearnOS 会话：FloatCTF 一旦在 Discovery 宣告 end_session_endpoint，
              // Better Auth 的 signOut 默认会构造 RP-Initiated Logout；这里显式关闭，
              // 只有用户明确选择「退出 FloatCTF 及所有应用」时才由 LearnOS 自己发起（见 lib/auth/actions.ts）。
              disableProviderLogout: true,
              getUserInfo: async (tokens) => {
                // 走到这里时 Better Auth 已验证过 ID Token（JWKS + nonce）。
                rememberFloatctfLogin(tokens.idToken);
                return fetchFloatctfUserInfo(tokens.accessToken);
              },
              mapProfileToUser: (profile) => {
                const subject = String(profile.sub ?? profile.id ?? "");
                const displayName =
                  (typeof profile.name === "string" && profile.name.trim()) ||
                  (typeof profile.preferred_username === "string" && profile.preferred_username) ||
                  `FloatCTF 用户 ${subject.slice(0, 8)}`;
                return {
                  // FloatCTF does not expose a verified email. A deterministic,
                  // non-deliverable placeholder keeps Better Auth's required
                  // field unique without enabling email-based account matching.
                  email: `${subject}@floatctf.invalid`,
                  emailVerified: false,
                  name: displayName.slice(0, 120),
                };
              },
            },
          ]
        : [],
    }),
    nextCookies(),
  ],
});

export type BetterSession = typeof auth.$Infer.Session;

/** FloatCTF UserInfo（与 Better Auth 默认的 userinfo 读取逻辑一致：sub → id，picture → image）。 */
async function fetchFloatctfUserInfo(accessToken: string | undefined) {
  if (!accessToken || !issuer) return null;
  const response = await fetch(`${issuer}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.sub !== "string") return null;
  return {
    ...data,
    id: data.sub,
    email: typeof data.email === "string" ? data.email : undefined,
    emailVerified: data.email_verified === true,
    image: typeof data.picture === "string" ? data.picture : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
  };
}
