import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth/session";
import { isFloatctfLoginEnabled } from "@/lib/auth/floatctf";
import { ClearPrivateLocalData } from "@/components/auth/clear-private-local-data";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const profile = await getSessionProfile();
  if (profile && !profile.disabledAt) {
    redirect(profile.role === "admin" ? "/admin" : "/courses");
  }

  const params = await searchParams;
  const disabled = params.reason === "disabled";
  const reasonMessage =
    params.reason === "oauth_failed"
      ? "FloatCTF 登录未完成，请重试或使用邮箱密码登录。"
      : params.reason === "signup_closed"
        ? "FloatCTF 新用户准入暂未开放，请联系管理员创建账号。"
        : params.reason === "link_failed"
          ? "FloatCTF 绑定未完成：请先登录 LearnOS 账号，再在「账号与登录方式」中重试。"
          : params.reason === "oauth_denied"
            ? "你已在 FloatCTF 取消登录，LearnOS 未登录任何账号。"
            : null;
  const signedOut = params.reason === "signed_out";
  const globalSignedOut = params.reason === "global_signed_out";
  const showFloatctf = isFloatctfLoginEnabled();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-muted/40 lg:block">
        <div className="grid-paper absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Image
              src="/float.png"
              alt=""
              aria-hidden
              width={44}
              height={46}
              priority
              className="h-11 w-auto object-contain dark:invert"
            />
            <div>
              <p className="font-serif text-lg font-semibold leading-none">LearnOS</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Learning Platform
              </p>
            </div>
          </div>

          <div className="max-w-lg">
            <h1 className="font-serif text-4xl leading-[1.15] tracking-tight">
              图文课程，
              <br />
              交互实验，
              <br />
              服务端测验。
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              学习记录保存在服务端。
            </p>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6">
              {[
                ["01", "学习进度"],
                ["02", "章节笔记"],
                ["03", "积分记录"],
              ].map(([n, label]) => (
                <div key={n}>
                  <dt className="font-mono text-xs text-muted-foreground">{n}</dt>
                  <dd className="mt-1 text-sm font-medium">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">课程内容由管理员发布。</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/float.png"
              alt=""
              aria-hidden
              width={44}
              height={46}
              priority
              className="h-11 w-auto object-contain dark:invert"
            />
            <div>
              <p className="font-serif text-2xl font-semibold leading-none">LearnOS</p>
              <p className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Learning Platform
              </p>
            </div>
          </div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">登录</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            使用 FloatCTF 账号登录，或使用管理员发放的邮箱与初始密码。
          </p>

          {disabled && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              账号已被停用，请联系管理员。
            </div>
          )}
          {signedOut && (
            <div
              role="status"
              className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              <ClearPrivateLocalData />
              已退出 LearnOS。这不会退出 FloatCTF：再次使用 FloatCTF 登录时，可以选择继续当前账号或使用其他账号。
            </div>
          )}
          {globalSignedOut && (
            <div
              role="status"
              className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              <ClearPrivateLocalData />
              已退出 LearnOS，并已在 FloatCTF 完成退出确认。FloatCTF 会通知其他已接入的应用；不支持即时通知的应用需在应用内手动退出。
            </div>
          )}
          {reasonMessage && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {reasonMessage}
            </div>
          )}

          <LoginForm next={params.next} showFloatctf={showFloatctf} />
        </div>
      </section>
    </div>
  );
}
