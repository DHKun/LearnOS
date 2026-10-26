"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import {
  LOGOUT_STATE_COOKIE,
  SIGNED_OUT_PATH,
  endSessionUrl,
  floatctfLinkForSession,
  newLogoutState,
} from "@/lib/auth/floatctf-logout";
import { signOutLearnOS } from "@/lib/auth/sign-out";
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

export type SignOutState = { error?: string };

/** 退出 LearnOS。只在 LearnOS 会话确实失效后才跳转；失败时如实告知，不伪装成已退出。 */
export async function signOutAction(
  _previous: SignOutState,
  _formData: FormData,
): Promise<SignOutState> {
  const result = await signOutLearnOS(await headers());
  if (!result.ok) {
    return { error: "退出失败，你仍处于登录状态，请重试。" };
  }
  redirect("/login?reason=signed_out");
}

/** 浏览器当前访问的 LearnOS origin（多主机部署时回到用户所在的主机）。 */
function requestOrigin(requestHeaders: Headers): string {
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ? "https" : "http");
  if (host) return `${proto}://${host}`;
  return (process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "");
}

/**
 * 「退出 FloatCTF 及所有应用」：用户在确认对话框中明确选择后才调用。
 *
 * 先确实结束 LearnOS 会话（失败如实告知），再把浏览器带到 FloatCTF 的 end_session 确认页；
 * FloatCTF 确认后撤销身份会话并向已接入的应用发送 Back-Channel Logout。
 * 只对经 FloatCTF 登录的会话可用；普通「退出 LearnOS」不走这里。
 */
export async function signOutEverywhereAction(
  _previous: SignOutState,
  _formData: FormData,
): Promise<SignOutState> {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders }).catch(() => null);
  if (!current?.session) redirect("/login");
  const link = await floatctfLinkForSession(current.session.id);
  const clientId = process.env.FLOATCTF_OIDC_CLIENT_ID ?? "";
  if (!link || !clientId) {
    return { error: "当前登录不是通过 FloatCTF 建立的，请使用「退出 LearnOS」。" };
  }
  const result = await signOutLearnOS(requestHeaders);
  if (!result.ok) {
    return { error: "退出失败，你仍处于登录状态，请重试。" };
  }
  const state = newLogoutState();
  const origin = requestOrigin(requestHeaders);
  (await cookies()).set(LOGOUT_STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: SIGNED_OUT_PATH,
    maxAge: 600,
  });
  redirect(
    endSessionUrl({
      issuer: link.issuer,
      idToken: link.idToken,
      clientId,
      postLogoutRedirectUri: `${origin}${SIGNED_OUT_PATH}`,
      state,
    }),
  );
}
