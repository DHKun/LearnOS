import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export type Role = "student" | "admin";

export type SessionProfile = {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  disabledAt: string | null;
};

function toProfile(row: typeof profiles.$inferSelect): SessionProfile {
  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role === "admin" ? "admin" : "student",
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
  };
}

/** Request-scoped Better Auth session + LearnOS profile lookup. */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (!profile) return null;
  return toProfile(profile);
});

export async function requireStudent(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.disabledAt) redirect("/login?reason=disabled");
  if (profile.role === "admin") redirect("/admin");
  return profile;
}

export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.disabledAt) redirect("/login?reason=disabled");
  if (profile.role !== "admin") redirect("/courses");
  return profile;
}
