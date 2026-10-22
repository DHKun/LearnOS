"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <form
      action={signOutAction}
      onSubmit={() => {
        try {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith("learnos:note:")) window.localStorage.removeItem(key);
          }
        } catch {
          // Storage may be unavailable; logout still proceeds.
        }
      }}
    >
      <Button type="submit" variant="outline" size="sm">
        <LogOut className="size-3.5" /> 退出
      </Button>
    </form>
  );
}
