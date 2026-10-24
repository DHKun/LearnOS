"use client";

import * as React from "react";
import { LogIn } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function FloatctfLoginButton({ next }: { next?: string | null }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onClick = async () => {
    setError(null);
    setPending(true);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        callback.searchParams.set("next", next);
      }
      await authClient.signIn.social({
        provider: "floatctf",
        callbackURL: callback.toString(),
      });
    } catch {
      setPending(false);
      setError("FloatCTF 登录暂不可用，请使用邮箱密码登录。");
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
      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
