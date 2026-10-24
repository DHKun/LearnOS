"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock3,
  FileDiff,
  Hammer,
  History,
  Loader2,
  RotateCcw,
  Server,
  Terminal,
} from "lucide-react";

import { CourseScanPanel, CourseUpdateDialog } from "@/components/admin/course-scan-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { usePolling } from "@/lib/client/use-polling";
import type {
  DeploymentJob,
  DeploymentJobStatus,
  DeploymentOverview,
  ScannedCourse,
} from "@/lib/deployments/types";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

const ACTIVE_STATUSES = new Set<DeploymentJobStatus>([
  "queued",
  "validating",
  "building",
  "syncing",
  "switching",
  "health_check",
  "rolling_back",
]);

const STATUS_LABEL: Record<DeploymentJobStatus, string> = {
  queued: "等待部署",
  validating: "正在校验",
  building: "正在构建",
  syncing: "正在同步课程",
  switching: "正在更新容器",
  health_check: "正在检查服务",
  rolling_back: "正在回滚",
  succeeded: "部署成功",
  failed: "部署失败",
  rolled_back: "已自动回滚",
};

const STATUS_VARIANT: Record<
  DeploymentJobStatus,
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive"
> = {
  queued: "outline",
  validating: "warning",
  building: "warning",
  syncing: "warning",
  switching: "warning",
  health_check: "warning",
  rolling_back: "warning",
  succeeded: "success",
  failed: "destructive",
  rolled_back: "secondary",
};

const DEPLOY_STEPS = [
  { label: "校验", statuses: ["queued", "validating"] },
  { label: "构建", statuses: ["building"] },
  { label: "兼容性/同步", statuses: ["syncing"] },
  { label: "更新容器", statuses: ["switching"] },
  { label: "健康检查", statuses: ["health_check"] },
] as const;

function shortDigest(value: string | null | undefined): string {
  return value ? value.slice(0, 12) : "—";
}

function logText(job: DeploymentJob | null): string {
  if (!job) return "";
  return job.logs
    .slice(-700)
    .map((line) => `[${formatDateTime(line.at)}] ${line.level.toUpperCase()} ${line.message}`)
    .join("\n");
}

function stepIndex(status: DeploymentJobStatus): number {
  if (status === "succeeded") return DEPLOY_STEPS.length;
  if (status === "failed" || status === "rolled_back") return -1;
  return DEPLOY_STEPS.findIndex((step) =>
    (step.statuses as readonly DeploymentJobStatus[]).includes(status),
  );
}

export function DeploymentsConsole({ initial }: { initial: DeploymentOverview }) {
  const [overview, setOverview] = React.useState(initial);
  const [scanning, setScanning] = React.useState(false);
  const [busy, setBusy] = React.useState<"deploy" | "rollback" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<"deploy" | "rollback" | null>(null);
  const [preview, setPreview] = React.useState<ScannedCourse | null>(null);
  const [logJob, setLogJob] = React.useState<DeploymentJob | null>(null);
  const [logLoading, setLogLoading] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const requestRef = React.useRef(0);
  const logRef = React.useRef<HTMLPreElement>(null);

  const refresh = React.useCallback(async (silent = false) => {
    const requestId = ++requestRef.current;
    if (!silent) setError(null);
    try {
      const data = await apiFetch<DeploymentOverview>("/api/admin/deployments");
      if (requestId === requestRef.current) setOverview(data);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setError(caught instanceof ApiClientError ? caught.message : "无法读取部署状态");
      }
    }
  }, []);

  usePolling(() => refresh(true), 2500, !dialogOpen);

  React.useEffect(() => {
    setDialogOpen(confirm !== null || preview !== null || logJob !== null || logLoading);
  }, [confirm, preview, logJob, logLoading]);

  React.useEffect(() => {
    if (dialogOpen) return;
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [overview.active?.logs.length, dialogOpen]);

  const active = overview.active;
  const activeBusy = active !== null && ACTIVE_STATUSES.has(active.status);
  const previousVersion = overview.state.previousVersion;
  const canDeploy = overview.scan.canDeploy && !activeBusy && busy === null;
  const canRollback = Boolean(overview.state.previousJobId) && !activeBusy && busy === null;

  async function scan() {
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const next = await apiFetch<DeploymentOverview["scan"]>("/api/admin/deployments/scan");
      setOverview((current) => ({ ...current, scan: next }));
      setMessage(`扫描完成：${next.counts.new} 门新课程，${next.counts.updated} 门有更新。`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  }

  async function start(action: "deploy" | "rollback") {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/admin/deployments", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setMessage(action === "deploy" ? "部署任务已创建，等待更新程序领取。" : "回滚任务已创建。");
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "无法创建任务");
    } finally {
      setBusy(null);
    }
  }

  async function openLogs(id: string) {
    setLogLoading(true);
    setError(null);
    try {
      setLogJob(await apiFetch<DeploymentJob>(`/api/admin/deployments/${id}`));
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "无法读取构建日志");
    } finally {
      setLogLoading(false);
    }
  }

  const currentCourses = overview.current?.courses ?? [];
  const currentIndex = active ? stepIndex(active.status) : -1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
          {scanning ? <Loader2 className="size-4 animate-spin" /> : <FileDiff className="size-4" />}
          {scanning ? "扫描中…" : "扫描更新"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => setConfirm("deploy")}
          disabled={!canDeploy}
        >
          {busy === "deploy" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Hammer className="size-4" />
          )}
          编译并部署
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirm("rollback")}
          disabled={!canRollback}
        >
          <RotateCcw className="size-4" /> 回滚到上一个版本
        </Button>
        <span className="text-xs text-muted-foreground">
          页面每 2.5 秒刷新；任务与日志保存在 PostgreSQL，刷新不丢状态。
        </span>
      </div>

      {(error || message) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>{error ?? message}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">当前系统版本</p>
          <p className="mt-2 font-mono text-2xl font-semibold">
            {overview.state.currentVersion ?? "未部署"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {overview.current?.finishedAt
              ? `成功于 ${formatDateTime(overview.current.finishedAt)}`
              : "尚未通过 Compose 记录成功部署"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">上一个成功版本</p>
          <p className="mt-2 font-mono text-2xl font-semibold">
            {overview.state.previousVersion ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {previousVersion ? "可用于手动回滚" : "暂无上一版本镜像引用"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">当前镜像</p>
          <p className="mt-2 truncate font-mono text-sm font-semibold">
            {shortDigest(overview.state.currentImageId)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {overview.current?.imageTag ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">任务状态</p>
          <p className="mt-2 flex items-center gap-2 font-serif text-xl font-semibold">
            {active ? (
              <>
                <Loader2 className="size-5 animate-spin text-warning" />
                {STATUS_LABEL[active.status]}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-5 text-success" /> 空闲
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {active ? `开始于 ${formatRelative(active.startedAt ?? active.createdAt)}` : "没有进行中的任务"}
          </p>
        </div>
      </div>

      {active && (
        <Card className="border-warning/40">
          <CardHeader className="border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Server className="size-4" />
                {active.kind === "rollback" ? "回滚任务" : "部署任务"} · {active.deploymentVersion}
              </CardTitle>
              <Badge variant={STATUS_VARIANT[active.status]}>{STATUS_LABEL[active.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              阶段：{active.phase ?? STATUS_LABEL[active.status]} · 最近心跳{" "}
              {formatRelative(active.heartbeatAt)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {active.kind === "deploy" ? (
              <div className="grid gap-2 sm:grid-cols-5">
                {DEPLOY_STEPS.map((step, index) => {
                  const done = currentIndex > index || active.status === "succeeded";
                  const current = currentIndex === index && active.status !== "succeeded";
                  return (
                    <div
                      key={step.label}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs",
                        done && "border-success/40 bg-success/5 text-success",
                        current && "border-warning/50 bg-warning/10 text-foreground",
                        !done && !current && "border-border text-muted-foreground",
                      )}
                    >
                      <span className="mr-1 font-mono">{index + 1}</span>
                      {step.label}
                      {current ? "…" : done ? " ✓" : ""}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                回滚只切换镜像，不重建、不删除课程或学习记录。健康检查失败会自动恢复当前镜像。
              </p>
            )}

            {active.error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {active.error}
              </p>
            )}

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Terminal className="size-3.5" /> 实时构建日志
              </p>
              <pre
                ref={logRef}
                className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200"
              >
                {logText(active) || "等待更新程序输出…"}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <CourseScanPanel scan={overview.scan} onOpenCourse={setPreview} />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="size-4" /> 当前课程版本清单
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            来自最近一次成功部署的固定快照，不是实时文件系统。
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          {currentCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              还没有成功部署记录。第一次「编译并部署」完成后，这里会显示课程版本与摘要。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>课程</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>章节</TableHead>
                  <TableHead>源码摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentCourses.map((course) => (
                  <TableRow key={course.slug}>
                    <TableCell>
                      <p className="font-medium">{course.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{course.slug}</p>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{course.version}</TableCell>
                    <TableCell className="font-mono text-sm">{course.lessons.length}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {shortDigest(course.sourceDigest)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" /> 历史更新记录
          </CardTitle>
          <p className="text-xs text-muted-foreground">仅保留最近 20 条任务；镜像只保留当前与上一个成功版本。</p>
        </CardHeader>
        <CardContent className="pt-4">
          {overview.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有部署任务。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>开始</TableHead>
                    <TableHead>结束</TableHead>
                    <TableHead className="text-right">日志</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.history.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-sm">{job.deploymentVersion}</TableCell>
                      <TableCell className="text-sm">
                        {job.kind === "rollback" ? "回滚" : "部署"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                        {job.error && (
                          <p className="mt-1 max-w-xs truncate text-xs text-destructive" title={job.error}>
                            {job.error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(job.startedAt ?? job.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(job.finishedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openLogs(job.id)}
                        >
                          <Clock3 className="size-3.5" /> 查看
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {overview.scan.blockingReasons.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          扫描存在阻塞项，部署按钮已禁用。修复课程目录或版本后重新扫描。
        </p>
      )}

      <CourseUpdateDialog course={preview} onOpenChange={(open) => !open && setPreview(null)} />

      <ConfirmDialog
        open={confirm === "deploy"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="编译并部署当前课程？"
        description="更新程序会创建本地源码快照，执行 courses:prepare / courses:validate、Docker Compose 构建、兼容性检查、courses:sync 和容器替换。构建失败不会替换旧容器。"
        confirmLabel="开始编译并部署"
        onConfirm={() => start("deploy")}
      />

      <ConfirmDialog
        open={confirm === "rollback"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`回滚到 ${previousVersion ?? "上一个版本"}？`}
        description="将把上一成功版本的镜像重新启动为 Web 容器。部署程序会先检查课程结构与已有学习记录是否兼容；不兼容时拒绝回滚。"
        confirmLabel="确认回滚"
        destructive
        onConfirm={() => start("rollback")}
      />

      <Dialog
        open={logJob !== null || logLoading}
        onOpenChange={(open) => {
          if (!open && !logLoading) setLogJob(null);
        }}
      >
        <DialogContent className="max-h-[85vh] w-[min(94vw,56rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>构建日志 · {logJob?.deploymentVersion ?? ""}</DialogTitle>
            <DialogDescription>
              {logJob
                ? `${logJob.kind === "rollback" ? "回滚" : "部署"} · ${STATUS_LABEL[logJob.status]} · ${formatDateTime(logJob.finishedAt)}`
                : "读取中…"}
            </DialogDescription>
          </DialogHeader>
          {logLoading ? (
            <p className="text-sm text-muted-foreground">正在读取日志…</p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
              {logText(logJob) || "没有日志。"}
            </pre>
          )}
          {logJob?.error && <p className="text-sm text-destructive">{logJob.error}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
