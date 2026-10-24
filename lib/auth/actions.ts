"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export type LoginState = { error?: string };

const GENERIC_ERROR = "邮箱或密码不正确";

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "请输入邮箱和密码" };
  if (email.length > 320 || password.length > 200) return { error: GENERIC_ERROR };

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch {
    return { error: GENERIC_ERROR };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { error: GENERIC_ERROR };

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (!profile || profile.disabledAt) {
    await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
    return { error: "账号已被停用，请联系管理员" };
  }

  redirect(profile.role === "admin" ? "/admin" : "/courses");
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/login");
}
