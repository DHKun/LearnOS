import type { Metadata } from "next";

import { LinkFloatctfButton } from "@/components/auth/link-floatctf-button";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/session";
import { and, eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "账号与登录方式" };

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const student = await requireStudent();
  const params = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const linked = session?.user
    ? Boolean(
        (
          await db
            .select({ id: account.id })
            .from(account)
            .where(and(eq(account.userId, session.user.id), eq(account.providerId, "floatctf")))
            .limit(20)
        ).length,
      )
    : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="个人中心"
        title="账号与登录方式"
        description="管理 LearnOS 账号与 FloatCTF 单一登录（SSO）的绑定关系。"
      />

      {params.linked === "1" && (
        <p className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
          FloatCTF 已绑定。你的 LearnOS 用户 ID、课程进度、笔记和积分保持不变。
        </p>
      )}
      {params.error === "link_cancelled" ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          你已在 FloatCTF 取消绑定，账号未发生变化。
        </p>
      ) : params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          绑定未完成，请重试或联系管理员。
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前账号</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">显示名称</dt>
              <dd className="mt-1 font-medium">{student.displayName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">邮箱</dt>
              <dd className="mt-1">{student.email ?? "未设置"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">LearnOS 用户 ID</dt>
              <dd className="mt-1 break-all font-mono text-xs">{student.id}</dd>
            </div>
          </dl>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="font-medium">FloatCTF 单一登录</p>
            <p className="mt-1 text-muted-foreground">
              绑定后可用 FloatCTF 登录同一个 LearnOS 账号。绑定不会新建账号，也不会按邮箱自动合并。
            </p>
            <div className="mt-4">
              <LinkFloatctfButton linked={linked} />
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        如果你还没有 LearnOS 账号，可直接在登录页使用 FloatCTF 登录；系统会创建一个新的学生账号。
        如果你已有学习记录，请先使用管理员发放的邮箱密码登录，再在这里完成绑定，避免出现两个账号。
      </p>
    </div>
  );
}
