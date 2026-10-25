import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { session } from "./auth-schema";

/**
 * 经 FloatCTF OIDC 建立的 Better Auth 会话 ↔ FloatCTF 身份会话 `(iss, sid)`。
 *
 * - 只有「通过 FloatCTF 登录」时由服务端写入（ID Token 已由 Better Auth 按 JWKS + nonce 验证）；
 * - Back-Channel Logout 按 `(issuer, sid)`（或只带 sub 时按 `(issuer, subject)`）精确找到要撤销的会话；
 * - `id_token` 只用于用户明确「退出 FloatCTF 及所有应用」时作为 `id_token_hint`，从不下发给浏览器；
 * - 会话删除时随外键级联删除。
 */
export const floatctfOidcSessions = pgTable(
  "floatctf_oidc_sessions",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => session.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    sid: text("sid"),
    idToken: text("id_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("floatctf_oidc_sessions_issuer_sid_idx").on(table.issuer, table.sid),
    index("floatctf_oidc_sessions_issuer_subject_idx").on(table.issuer, table.subject),
  ],
);

/** 已处理的 Logout Token `jti`（防重放；过期后可清理）。 */
export const floatctfLogoutJti = pgTable(
  "floatctf_logout_jti",
  {
    issuer: text("issuer").notNull(),
    jti: text("jti").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.issuer, table.jti] })],
);
