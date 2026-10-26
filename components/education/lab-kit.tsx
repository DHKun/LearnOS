"use client";

/**
 * Shared shell for course simulation labs: the ticket that states the
 * symptom and goal, server submission, and the verdict footer.
 *
 * Course activities stay in their own `content/courses/<slug>/activities/`
 * folder; this module only holds pieces with no course-specific knowledge.
 */
import * as React from "react";
import { CheckCircle2, ClipboardList, XCircle } from "lucide-react";

import { ActivitySaveStatus } from "@/components/activities/status";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";
import type { SaveStatus } from "@/lib/learning/hooks";
import { cn } from "@/lib/utils";

export type LabVerdict = { passed: boolean; message: string };

/**
 * Submits a lab's state through the block-scoped Learning SDK. The server
 * validator alone decides `passed`; the message comes from its feedback.
 */
export function useLabSubmit() {
  const { sdk } = useLearning();
  const [pending, setPending] = React.useState(false);
  const [last, setLast] = React.useState<LabVerdict | null>(null);
  async function submit(data: Record<string, unknown>, event: string): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    try {
      const result = await sdk.submit(data);
      const message =
        typeof result.feedback?.message === "string"
          ? result.feedback.message
          : result.passed
            ? "通过"
            : "还没达成目标";
      setLast({ passed: result.passed, message });
      sdk.track(event, { passed: result.passed });
      return result.passed;
    } catch (caught) {
      setLast({ passed: false, message: caught instanceof Error ? caught.message : "提交失败" });
      return false;
    } finally {
      setPending(false);
    }
  }
  return { submit, pending, last };
}

/** Save status, the submit button and the server's verdict. */
export function LabFooter({
  save,
  passed,
  pending,
  readOnly,
  label,
  onSubmit,
  last,
  disabled = false,
}: {
  save: { status: SaveStatus; error: string | null; conflict: boolean; reload: () => Promise<void> };
  passed: boolean;
  pending: boolean;
  readOnly: boolean;
  label: string;
  onSubmit: () => void;
  last: LabVerdict | null;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActivitySaveStatus status={save.status} error={save.error} conflict={save.conflict} onReload={() => void save.reload()} />
        <Button disabled={readOnly || pending || passed || disabled} onClick={onSubmit}>
          {passed ? "已通过" : pending ? "服务端验证中…" : label}
        </Button>
      </div>
      {last && (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            last.passed ? "border-success/40 bg-success/10" : "border-warning/50 bg-warning/10",
          )}
        >
          <strong>{last.passed ? "服务端验证通过" : "还没通过"}</strong>
          <p className="mt-1 leading-relaxed">{last.message}</p>
        </div>
      )}
    </div>
  );
}

/** The lab's opening: a concrete symptom, and the outcome to reach. */
export function Ticket({ children, goal }: { children: React.ReactNode; goal?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <ClipboardList className="size-4" aria-hidden /> 工单
      </p>
      <div className="mt-2 leading-relaxed">{children}</div>
      {goal && (
        <p className="mt-3 rounded-md bg-background px-3 py-2 text-sm">
          <span className="font-semibold text-primary">目标：</span>
          {goal}
        </p>
      )}
    </div>
  );
}

/** Live client-side check result, e.g. one scenario of a configuration lab. */
export function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", ok ? "text-success" : "text-destructive")}>
      {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
      {children}
    </span>
  );
}
