"use client";

import { useActionState } from "react";

import { signInAction, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="student@example.com"
          required
          maxLength={320}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          maxLength={200}
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "正在登录…" : "登录"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        忘记密码？请联系管理员重置。
      </p>
    </form>
  );
}
