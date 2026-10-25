"use client";

import * as React from "react";
import { LogIn } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { floatctfSignInRequest } from "@/lib/auth/floatctf-request";
import { Button } from "@/components/ui/button";

export function FloatctfLoginButton({ next }: { next?: string | null }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onClick = async () => {
    setError(null);
    setPending(true);
    const fail = (message = "FloatCTF 登录暂不可用，请使用邮箱密码登录。") => {
      setPending(false);
      setError(message);
    };
    try {
      // prompt=select_account：浏览器里已有 FloatCTF 登录时，由 FloatCTF 显示账号选择页，
      // 用户主动确认当前账号或改用其他账号，而不是被静默带回。
      const result = await authClient.signIn.social(
        floatctfSignInRequest(window.location.origin, next),
      );
      if (result?.error) {
        fail(result.error.status === 429 ? "操作过于频繁，请稍等几秒后再试。" : undefined);
      }
    } catch {
      fail();
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
        disabled={pending}
      >
        <LogIn className="size-4" />
        {pending ? "正在跳转 FloatCTF…" : "使用 FloatCTF 登录"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        由 FloatCTF 验证身份；若浏览器已登录 FloatCTF，会先请你确认使用哪个账号。
      </p>
      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
