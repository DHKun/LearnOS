"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { signOutEverywhereAction } from "@/lib/auth/actions";

/**
 * 「退出 FloatCTF 及所有应用」：只对经 FloatCTF 登录的会话显示；必须在对话框中明确确认。
 * 普通「退出 LearnOS」不会触发 FloatCTF 退出。
 */
export function GlobalLogoutButton() {
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = React.useActionState(signOutEverywhereAction, {});

  return (
    <form ref={formRef} action={formAction} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(true)}
        aria-label="退出 FloatCTF 及所有应用"
        title="退出 LearnOS，并在 FloatCTF 确认退出所有关联应用"
      >
        <LogOut className="size-3.5" />
        <span className="hidden lg:inline">{pending ? "正在跳转…" : "退出 FloatCTF…"}</span>
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="退出 FloatCTF 及所有应用？"
        description="将先退出 LearnOS，再前往 FloatCTF 确认退出你的 FloatCTF 账号；确认后 FloatCTF 会通知其他已接入的应用结束会话。只想退出 LearnOS，请使用「退出 LearnOS」。"
        confirmLabel="继续退出"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
      />
      {state.error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-sm"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
