"use client";

import * as React from "react";
import { Link2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
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
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("intent", "link");
      callback.searchParams.set("next", "/account/connections");
      const supabase = createClient();
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "custom:floatctf",
        options: { redirectTo: callback.toString() },
      });
      if (linkError) {
        setPending(false);
        setError("暂时无法发起绑定，请稍后再试或联系管理员。");
      }
    } catch {
      setPending(false);
      setError("暂时无法发起绑定，请稍后再试或联系管理员。");
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
