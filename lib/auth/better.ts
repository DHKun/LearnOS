import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { nextCookies } from "better-auth/next-js";

import { profiles } from "@/lib/db/schema";

import { db } from "@/lib/db";

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
