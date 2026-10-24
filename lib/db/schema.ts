export * from "./auth-schema";

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** LearnOS authorization profile; intentionally separate from Better Auth user. */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  email: text("email"),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("student"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
