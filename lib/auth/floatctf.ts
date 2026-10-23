import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

export const FLOATCTF_PROVIDER = "custom:floatctf";

export class OidcProvisionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SIGNUP_DISABLED"
      | "PROVIDER_MISMATCH"
      | "PROFILE_CONFLICT",
  ) {
    super(message);
    this.name = "OidcProvisionError";
  }
}

/** Only same-origin absolute paths are accepted as post-login destinations. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function isFloatctfLoginEnabled(): boolean {
  return process.env.FLOATCTF_OIDC_ENABLED === "true";
}

export function isFloatctfSignupAllowed(): boolean {
  return process.env.FLOATCTF_ALLOW_SIGNUP === "true";
}

export function isFloatctfIdentity(user: User): boolean {
  const provider = user.app_metadata?.provider;
  return (
    provider === FLOATCTF_PROVIDER ||
    (user.identities ?? []).some((identity) => identity.provider === FLOATCTF_PROVIDER)
  );
}

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text.length > 0 ? text.slice(0, 120) : null;
}

export function deriveFloatctfDisplayName(user: User): string {
  const metadata = user.user_metadata ?? {};
  return (
    cleanDisplayName(metadata.display_name) ??
    cleanDisplayName(metadata.name) ??
    cleanDisplayName(metadata.preferred_username) ??
    cleanDisplayName(metadata.nickname) ??
    `FloatCTF 用户 ${user.id.slice(0, 8)}`
  );
}

export type LearnOSProfile = {
  id: string;
  email: string | null;
  displayName: string;
  role: "student" | "admin";
  disabledAt: string | null;
};

/**
 * Get the existing profile for an OIDC user, or create a student profile.
 *
 * This never derives a role from provider metadata. The profiles table trigger
 * also defaults to student; this fallback handles a missing trigger/profile.
 */
export async function getOrCreateFloatctfProfile(user: User): Promise<LearnOSProfile> {
  if (!isFloatctfIdentity(user)) {
    throw new OidcProvisionError("当前登录来源不是 FloatCTF", "PROVIDER_MISMATCH");
  }

  const db = createAdminClient();
  const load = async () => {
    const { data, error } = await db
      .from("profiles")
      .select("user_id,email,display_name,role,disabled_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  const existing = await load();
  if (existing) {
    return {
      id: existing.user_id,
      email: existing.email,
      displayName: existing.display_name,
      role: existing.role === "admin" ? "admin" : "student",
      disabledAt: existing.disabled_at,
    };
  }

  if (!isFloatctfSignupAllowed()) {
    throw new OidcProvisionError("FloatCTF 新用户准入已关闭", "SIGNUP_DISABLED");
  }

  const { error: insertError } = await db.from("profiles").insert({
    user_id: user.id,
    email: null,
    display_name: deriveFloatctfDisplayName(user),
    role: "student",
  });
  if (insertError) {
    // A concurrent callback may have won the insert; re-read instead of failing.
    if (insertError.code !== "23505") throw insertError;
  }

  const created = await load();
  if (!created) {
    throw new OidcProvisionError("无法创建 LearnOS 学生资料", "PROFILE_CONFLICT");
  }
  return {
    id: created.user_id,
    email: created.email,
    displayName: created.display_name,
    role: created.role === "admin" ? "admin" : "student",
    disabledAt: created.disabled_at,
  };
}
