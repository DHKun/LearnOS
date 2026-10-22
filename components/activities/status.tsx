"use client";

import { AlertTriangle, Check, Cloud, CloudOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/lib/learning/hooks";

export function ActivitySaveStatus({
  status,
  error,
  conflict,
  onReload,
}: {
  status: SaveStatus;
  error?: string | null;
  conflict?: boolean;
  onReload?: () => void;
}) {
  return (
    <div className="space-y-2 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-muted-foreground",
          status === "saved" && "text-success",
          (status === "error" || status === "conflict") && "text-destructive",
        )}
        aria-live="polite"
      >
        {status === "saving" ? (
          <>
            <Cloud className="size-3.5" /> 正在保存实验状态…
          </>
        ) : status === "saved" ? (
          <>
            <Check className="size-3.5" /> 实验状态已保存
          </>
        ) : status === "error" ? (
          <>
            <CloudOff className="size-3.5" /> 保存失败
          </>
        ) : status === "conflict" ? (
          <>
            <AlertTriangle className="size-3.5" /> 状态版本冲突
          </>
        ) : (
          "实验状态自动保存"
        )}
      </span>
      {error && <p className="text-destructive">{error}</p>}
      {conflict && onReload && (
        <Button type="button" variant="outline" size="sm" onClick={onReload}>
          重新加载最新状态
        </Button>
      )}
    </div>
  );
}
