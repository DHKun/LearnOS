"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileDiff, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CourseScanStatus,
  DeploymentScan,
  ScannedCourse,
} from "@/lib/deployments/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<CourseScanStatus, string> = {
  new: "新课程",
  updated: "有更新",
  latest: "已是最新",
  conflict: "版本冲突",
  scan_failed: "扫描失败",
  removed: "已移除",
};

const STATUS_VARIANT: Record<
  CourseScanStatus,
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
> = {
  new: "success",
  updated: "warning",
  latest: "outline",
  conflict: "destructive",
  scan_failed: "destructive",
  removed: "secondary",
};

const SUMMARY_ORDER: CourseScanStatus[] = [
  "new",
  "updated",
  "latest",
  "conflict",
  "scan_failed",
  "removed",
];

function shortDigest(value: string | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

function ChangeList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label}（{items.length}）
      </p>
      <ul className="space-y-0.5 font-mono text-xs">
        {items.slice(0, 200).map((item) => (
          <li key={item} className="break-all">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CourseUpdateDialog({
  course,
  onOpenChange,
}: {
  course: ScannedCourse | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={course !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(94vw,48rem)] overflow-y-auto">
        {course && (
          <>
            <DialogHeader>
              <DialogTitle>{course.title}</DialogTitle>
              <DialogDescription>
                <span className="font-mono">{course.slug}</span> · 版本{" "}
                {course.previousVersion ? `${course.previousVersion} → ` : ""}
                <span className="font-mono">{course.version}</span> · 已有 {course.enrollments} 条学习记录
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                <span className="text-xs text-muted-foreground">
                  source {shortDigest(course.sourceDigest)} · structure{" "}
                  {shortDigest(course.structuralDigest)}
                </span>
              </div>

              {course.messages.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  {course.messages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
              {course.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  {course.warnings.map((warning) => (
                    <p key={warning}>⚠ {warning}</p>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">新增文件</p>
                  <p className="font-serif text-2xl font-semibold tabular-nums">
                    {course.changes.added.length}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">修改文件</p>
                  <p className="font-serif text-2xl font-semibold tabular-nums">
                    {course.changes.modified.length}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">删除文件</p>
                  <p className="font-serif text-2xl font-semibold tabular-nums">
                    {course.changes.removed.length}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">章节结构</p>
                <div className="space-y-1 font-mono text-xs">
                  {course.lessons.map((lesson) => (
                    <div key={lesson.slug} className="flex flex-wrap gap-x-3 gap-y-1">
                      <span className="text-muted-foreground">{lesson.position + 1}.</span>
                      <span>{lesson.slug}</span>
                      <span className="text-muted-foreground">{lesson.type}</span>
                      <span className="text-muted-foreground">
                        {lesson.required ? "必修" : "选修"} / {lesson.completionPolicy}
                      </span>
                      {lesson.activityId && <span>activity: {lesson.activityId}</span>}
                      {lesson.finalExam && <span className="text-primary">finalExam</span>}
                      {lesson.passScore !== undefined && <span>pass {lesson.passScore}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-sm font-medium">Concept（{course.concepts.length}）</p>
                  {course.concepts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">无</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {course.concepts.map((concept) => (
                        <li key={concept.globalId} className="font-mono">
                          {concept.globalId}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-sm font-medium">Activity / Validator（{course.activities.length}）</p>
                  {course.activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">无</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {course.activities.map((activity) => (
                        <li key={activity.globalId} className="font-mono break-all">
                          {activity.globalId}
                          <span className="text-muted-foreground"> / {activity.validatorId}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            @ {shortDigest(activity.validatorFingerprint)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {(course.changes.added.length > 0 ||
                course.changes.modified.length > 0 ||
                course.changes.removed.length > 0) && (
                <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
                  <ChangeList label="新增" items={course.changes.added} />
                  <ChangeList label="修改" items={course.changes.modified} />
                  <ChangeList label="删除" items={course.changes.removed} />
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CourseScanPanel({
  scan,
  onScan,
  scanning = false,
  compact = false,
  onOpenCourse,
}: {
  scan: DeploymentScan;
  onScan?: () => void;
  scanning?: boolean;
  compact?: boolean;
  onOpenCourse?: (course: ScannedCourse) => void;
}) {
  const [preview, setPreview] = React.useState<ScannedCourse | null>(null);
  const pending = scan.items.filter((item) => item.status !== "latest");
  const visible = compact ? pending.slice(0, 6) : pending;

  return (
    <Card>
      <CardHeader className="gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileDiff className="size-4" /> 课程扫描
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            只读取本地 <code>content/courses/</code>，不会触发构建。
            {scan.baselineVersion ? ` 对比基线：${scan.baselineVersion}` : " 尚无成功部署基线。"}
          </p>
        </div>
        {onScan && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onScan}
            disabled={scanning}
          >
            <RefreshCw className={cn("size-4", scanning && "animate-spin")} />
            {scanning ? "扫描中…" : "扫描更新"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {SUMMARY_ORDER.map((status) => (
            <div key={status} className="rounded-lg border border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{STATUS_LABEL[status]}</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{scan.counts[status]}</p>
            </div>
          ))}
        </div>

        {scan.blockingReasons.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> 部署已阻止
            </p>
            {scan.blockingReasons.map((reason) => (
              <p key={reason} className="text-xs">
                {reason}
              </p>
            ))}
          </div>
        )}

        {scan.failures.length > 0 && (
          <div className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm">
            {scan.failures.map((failure) => (
              <p key={`${failure.slug}-${failure.error}`} className="text-xs text-destructive">
                <span className="font-mono">{failure.slug}</span>: {failure.error}
              </p>
            ))}
          </div>
        )}

        {scan.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">本地没有可识别的课程目录。</p>
        ) : pending.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" /> 所有本地课程都已是最新。
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((item) => (
              <div
                key={item.slug}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {item.slug} · {item.previousVersion ?? "新"} → {item.version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    已有 {item.enrollments} 条学习记录 · {item.changes.modified.length} 个文件修改
                    {item.warnings.length > 0 ? ` · ⚠ ${item.warnings[0]}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => (onOpenCourse ? onOpenCourse(item) : setPreview(item))}
                  >
                    查看更新内容
                  </Button>
                </div>
              </div>
            ))}
            {compact && pending.length > visible.length && (
              <p className="text-xs text-muted-foreground">
                还有 {pending.length - visible.length} 门课程，请到部署页面查看完整列表。
              </p>
            )}
          </div>
        )}

        {scan.items.some((item) => item.status === "latest") && (
          <p className="text-xs text-muted-foreground">
            已是最新的课程：{scan.items.filter((item) => item.status === "latest").map((item) => item.slug).join("、")}
          </p>
        )}
      </CardContent>

      <CourseUpdateDialog course={preview} onOpenChange={(open) => !open && setPreview(null)} />
    </Card>
  );
}
