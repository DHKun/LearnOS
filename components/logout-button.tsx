"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  // 本地笔记缓存在退出成功后由登录页清理（见 ClearPrivateLocalData），
  // 退出失败时用户仍处于登录状态，不能先删掉他的本地草稿。
  const [state, formAction, pending] = React.useActionState(signOutAction, {});

  return (
    <form action={formAction} className="relative">
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        title="只退出 LearnOS，不会退出 FloatCTF"
      >
        <LogOut className="size-3.5" /> {pending ? "正在退出…" : "退出 LearnOS"}
      </Button>
      {state.error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-sm"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
