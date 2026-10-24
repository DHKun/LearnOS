"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { FloatctfLoginButton } from "@/components/auth/floatctf-login-button";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  next,
  showFloatctf = true,
}: {
  next?: string | null;
  showFloatctf?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("请输入邮箱和密码");
      setPending(false);
      return;
    }
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError("邮箱或密码不正确");
        setPending(false);
        return;
      }
      const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/courses";
      router.replace(target);
      router.refresh();
    } catch {
      setError("邮箱或密码不正确");
      setPending(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      {showFloatctf && (
        <>
          <FloatctfLoginButton next={next} />
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            或使用邮箱密码
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input id="email" name="email" type="email" autoComplete="username" placeholder="student@example.com" required maxLength={320} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required maxLength={200} />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "正在登录…" : "登录"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">忘记密码？请联系管理员重置。</p>
      </form>
    </div>
  );
}
