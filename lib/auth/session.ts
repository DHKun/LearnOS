import { cache } from "react";
import { redirect } from "next/navigation";

import { getVerifiedUserId } from "@/lib/supabase/claims";
import { createClient } from "@/lib/supabase/server";

export type Role = "student" | "admin";

export type SessionProfile = {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  disabledAt: string | null;
};

function toProfile(row: {
  user_id: string;
  email: string | null;
  display_name: string;
  role: string;
  disabled_at: string | null;
}): SessionProfile {
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role === "admin" ? "admin" : "student",
    disabledAt: row.disabled_at,
  };
}

/** Request-scoped session lookup. Returns null when unauthenticated. */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id,email,display_name,role,disabled_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return null;
  return toProfile(profile);
});

/** Page guard for student-only pages. */
export async function requireStudent(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.disabledAt) redirect("/login?reason=disabled");
  if (profile.role === "admin") redirect("/admin");
  return profile;
}

/** Page guard for admin-only pages. */
export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.disabledAt) redirect("/login?reason=disabled");
  if (profile.role !== "admin") redirect("/courses");
  return profile;
}
