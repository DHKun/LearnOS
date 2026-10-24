import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export const FLOATCTF_PROVIDER = "floatctf";

type UserLike = {
  id: string;
  email?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider: string }>;
};

export class OidcProvisionError extends Error {
  constructor(
    message: string,
    readonly code: "SIGNUP_DISABLED" | "PROVIDER_MISMATCH" | "PROFILE_CONFLICT",
  ) {
    super(message);
    this.name = "OidcProvisionError";
  }
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function isFloatctfLoginEnabled(): boolean {
  return Boolean(process.env.FLOATCTF_OIDC_ISSUER) &&
    process.env.FLOATCTF_OIDC_ENABLED !== "false";
}

export function isFloatctfSignupAllowed(): boolean {
  return process.env.FLOATCTF_ALLOW_SIGNUP !== "false";
}

export function isFloatctfIdentity(user: UserLike): boolean {
  const providers = new Set([
    user.app_metadata?.provider,
    ...(user.identities ?? []).map((identity) => identity.provider),
  ]);
  return ["floatctf", "custom:floatctf", "keycloak"].some((provider) =>
    providers.has(provider),
  );
}

function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text.length > 0 ? text.slice(0, 120) : null;
}

export function deriveFloatctfDisplayName(user: UserLike): string {
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

export async function getOrCreateFloatctfProfile(user: UserLike): Promise<LearnOSProfile> {
  if (!isFloatctfIdentity(user)) {
    throw new OidcProvisionError("当前登录来源不是 FloatCTF", "PROVIDER_MISMATCH");
  }

  const [existing] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  if (existing) {
    return {
      id: existing.userId,
      email: existing.email,
      displayName: existing.displayName,
      role: existing.role === "admin" ? "admin" : "student",
      disabledAt: existing.disabledAt ? existing.disabledAt.toISOString() : null,
    };
  }

  if (!isFloatctfSignupAllowed()) {
    throw new OidcProvisionError("FloatCTF 新用户准入已关闭", "SIGNUP_DISABLED");
  }

  await db
    .insert(profiles)
    .values({
      userId: user.id,
      email: null,
      displayName: deriveFloatctfDisplayName(user),
      role: "student",
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  if (!created) throw new OidcProvisionError("无法创建 LearnOS 学生资料", "PROFILE_CONFLICT");

  return {
    id: created.userId,
    email: created.email,
    displayName: created.displayName,
    role: created.role === "admin" ? "admin" : "student",
    disabledAt: created.disabledAt ? created.disabledAt.toISOString() : null,
  };
}
