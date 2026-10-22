"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

const GENERIC_ERROR = "邮箱或密码不正确";

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请输入邮箱和密码" };
  }
  if (email.length > 320 || password.length > 200) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: GENERIC_ERROR };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,disabled_at")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.disabled_at) {
    await supabase.auth.signOut();
    return { error: "账号已被停用，请联系管理员" };
  }

  redirect(profile.role === "admin" ? "/admin" : "/courses");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
