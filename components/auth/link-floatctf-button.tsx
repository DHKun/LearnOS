"use client";

import * as React from "react";
import { Link2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { floatctfLinkRequest } from "@/lib/auth/floatctf-request";
import { Button } from "@/components/ui/button";

export function LinkFloatctfButton({ linked }: { linked: boolean }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (linked) {
    return (
      <p className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
        FloatCTF 已绑定；之后可直接使用 FloatCTF 登录这个 LearnOS 账号。
      </p>
    );
  }

  const onClick = async () => {
    setError(null);
    setPending(true);
    const unavailable = () => {
      setPending(false);
      setError("暂时无法发起绑定，请稍后再试或联系管理员。");
    };
    try {
      // 绑定同样要求在 FloatCTF 确认账号，避免浏览器里残留的其他 FloatCTF 登录被静默绑定。
      const result = await authClient.linkSocial(floatctfLinkRequest(window.location.origin));
      if (result?.error) unavailable();
    } catch {
      unavailable();
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={pending}>
        <Link2 className="size-4" />
        {pending ? "正在跳转 FloatCTF…" : "绑定 FloatCTF 账号"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
