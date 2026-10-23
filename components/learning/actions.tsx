"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ApiClientError, apiFetch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { EnrollmentSummary } from "@/lib/types";

export function JoinCourseButton({
  courseId,
  label = "参加课程",
  size = "default",
}: {
  courseId: string;
  label?: string;
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    router.prefetch(`/learn/${courseId}`);
  }, [courseId, router]);

  async function join() {
    setPending(true);
    setError(null);
    try {
      await apiFetch<EnrollmentSummary>("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      });
      router.push(`/learn/${courseId}`);
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof ApiClientError ? caught.message : "参加课程失败，请稍后重试";
      setError(message);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={join} disabled={pending} size={size}>
        {pending ? "正在进入…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function AbandonCourseButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  async function abandon() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/enrollments/${enrollmentId}/abandon`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push("/courses");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "退出失败");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
      >
        {pending ? "正在退出…" : "退出课程"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="退出当前课程？"
        description="章节进度、实验状态与笔记会保留，重新参加后可从原进度继续。"
        confirmLabel="退出课程"
        destructive
        onConfirm={abandon}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function CompleteLessonButton({
  lessonId,
  enrollmentId,
  completed,
  onCompleted,
}: {
  lessonId: string;
  enrollmentId: string;
  completed: boolean;
  onCompleted?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(completed);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDone(completed);
  }, [completed]);

  async function complete() {
    if (pending || done) return;
    // Reflect completion only after the server transaction succeeds. An
    // optimistic label could invite the student to navigate away and abort
    // the request before the chapter/points are recorded.
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/lessons/${lessonId}/complete`, {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({ enrollmentId }),
      });
      setDone(true);
      onCompleted?.();
      router.refresh();
    } catch (caught) {
      setDone(false);
      setError(caught instanceof ApiClientError ? caught.message : "标记失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={complete} disabled={pending || done} variant={done ? "secondary" : "default"}>
        {done ? "本章已完成" : pending ? "正在记录…" : "标记本章完成 · +10"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
