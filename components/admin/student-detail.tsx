"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, KeyRound, Lock, RefreshCw, Unlock } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OnlineDot, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { describeEvent } from "@/lib/education/event-labels";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { AdminStudentDetail } from "@/lib/types";

const TABS = [
  ["overview", "概览"],
  ["lessons", "章节进度"],
  ["timeline", "学习时间线"],
  ["points", "成绩与积分"],
] as const;

type Tab = (typeof TABS)[number][0];

export function StudentDetailView({ initial }: { initial: AdminStudentDetail }) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"toggle" | "reset" | null>(null);
  const requestRef = React.useRef(0);

  const refresh = React.useCallback(async (silent = false) => {
    const id = ++requestRef.current;
    if (!silent) setRefreshing(true);
    try {
      const next = await apiFetch<AdminStudentDetail>(
        `/api/admin/students/${initial.student.id}`,
      );
      if (id === requestRef.current) {
        setData(next);
        setError(null);
      }
    } catch (caught) {
      if (id === requestRef.current) {
        setError(caught instanceof ApiClientError ? caught.message : "刷新失败");
      }
    } finally {
      if (id === requestRef.current) setRefreshing(false);
    }
  }, [initial.student.id]);

  usePolling(() => refresh(true), 30_000, confirm === null);

  async function runAction(action: "toggle" | "reset") {
    setError(null);
    setMessage(null);
    try {
      if (action === "toggle") {
        await apiFetch(`/api/admin/students/${data.student.id}`, {
          method: "PATCH",
          body: JSON.stringify({ disabled: !data.student.disabled }),
        });
        setMessage(data.student.disabled ? "账号已启用" : "账号已停用");
      } else {
        await apiFetch(`/api/admin/students/${data.student.id}/reset-password`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        setMessage("密码重置邮件已请求发送（本地环境可在 Mailpit 查看）");
      }
      await refresh(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "操作失败");
    }
  }

  const current = data.current;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{data.student.name}</h1>
            <Badge variant={data.student.disabled ? "destructive" : "success"}>
              {data.student.disabled ? "已停用" : "正常"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{data.student.email ?? "无邮箱"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            注册于 {formatDateTime(data.student.createdAt)} · 积分 {data.student.points}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> 刷新
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("reset")}>
            <KeyRound className="size-4" /> 重置密码
          </Button>
          <Button
            type="button"
            size="sm"
            variant={data.student.disabled ? "default" : "destructive"}
            onClick={() => setConfirm("toggle")}
          >
            {data.student.disabled ? <Unlock className="size-4" /> : <Lock className="size-4" />}
            {data.student.disabled ? "启用账号" : "停用账号"}
          </Button>
        </div>
      </div>

      {(error || message) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="学生详情">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={
              tab === value
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">当前学习</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {current ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/courses/${current.courseId}`}
                      className="font-medium hover:text-primary"
                    >
                      {current.courseTitle}
                    </Link>
                    <StatusBadge status={current.status} />
                  </div>
                  <p className="text-muted-foreground">
                    当前章节：{current.currentLesson ?? "—"}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${current.progress.percent}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs">
                      {current.progress.completed}/{current.progress.total}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="text-xs text-muted-foreground">
                      最近在线：{formatRelative(current.lastSeenAt)} <OnlineDot online={current.online} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      最近有效交互：{formatRelative(current.lastInteractionAt)}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">当前没有进行中的课程。</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">账号与提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>课程无时间限制；长期未活动只表示需要关注，不会自动退出或判定失败。</p>
              <p>管理员默认无法读取学生私人笔记。</p>
              <p>在线仅表示最近 120 秒有心跳，不代表正在学习。</p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "lessons" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">章节进度</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>章节</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>要求</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>完成时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lessons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      该学生当前没有章节进度。
                    </TableCell>
                  </TableRow>
                )}
                {data.lessons.map((lesson) => (
                  <TableRow key={lesson.lessonId}>
                    <TableCell className="font-medium">{lesson.title}</TableCell>
                    <TableCell>{lesson.type}</TableCell>
                    <TableCell>{lesson.required ? "必修" : "选做"}</TableCell>
                    <TableCell>
                      <Badge variant={lesson.status === "completed" ? "success" : "outline"}>
                        {lesson.status === "completed"
                          ? "已完成"
                          : lesson.status === "in_progress"
                            ? "进行中"
                            : "未开始"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lesson.completedAt ? formatDateTime(lesson.completedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">学习时间线</CardTitle>
            <p className="text-xs text-muted-foreground">
              只展示有价值的交互事件；客户端事件是遥测声明，不是不可伪造的过关证明。
            </p>
          </CardHeader>
          <CardContent>
            {data.recentEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无学习事件。</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {data.recentEvents.map((event) => {
                  const described = describeEvent(event.type, event.payload);
                  return (
                    <li key={event.id} className="relative">
                      <span className="absolute -left-[1.45rem] top-1.5 size-2 rounded-full bg-primary" />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{described.label}</p>
                        <time className="text-xs text-muted-foreground">
                          {formatDateTime(event.createdAt)}
                        </time>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {event.lessonTitle ?? "未知章节"}
                        {described.detail ? ` · ${described.detail}` : ""}
                      </p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground">
                          技术详情
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[11px]">
{JSON.stringify({ type: event.type, stepId: event.stepId, payload: event.payload }, null, 2)}
                        </pre>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "points" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">课程完成情况</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.history.length === 0 && (
                <p className="text-sm text-muted-foreground">暂无课程记录。</p>
              )}
              {data.history.map((item) => (
                <div key={item.enrollmentId} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/courses/${item.courseId}`}
                      className="text-sm font-medium hover:text-primary"
                    >
                      {item.courseTitle}
                    </Link>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    进度 {item.progress.completed}/{item.progress.total} · 开始{" "}
                    {formatDateTime(item.startedAt)}
                    {item.completedAt ? ` · 完成 ${formatDateTime(item.completedAt)}` : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">积分历史</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>原因</TableHead>
                    <TableHead>变动</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pointEvents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        暂无积分记录。
                      </TableCell>
                    </TableRow>
                  )}
                  {data.pointEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.reason}</TableCell>
                      <TableCell className={event.delta >= 0 ? "text-success" : "text-destructive"}>
                        {event.delta > 0 ? "+" : ""}
                        {event.delta}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/students" className="text-muted-foreground hover:text-foreground">
          ← 返回学生列表
        </Link>
        {current && (
          <Link
            href={`/admin/courses/${current.courseId}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            查看当前课程 <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm === "reset"
            ? "发送密码重置邮件？"
            : data.student.disabled
              ? "重新启用该学生账号？"
              : "停用该学生账号？"
        }
        description={
          confirm === "reset"
            ? `将向 ${data.student.email ?? "该学生邮箱"} 发送密码重置邮件。`
            : data.student.disabled
              ? "启用后该学生可立即恢复登录和学习。"
              : "停用后业务请求会立即被拒绝，历史学习记录不会删除。"
        }
        confirmLabel={
          confirm === "reset" ? "发送邮件" : data.student.disabled ? "启用账号" : "停用账号"
        }
        destructive={confirm === "toggle" && !data.student.disabled}
        onConfirm={async () => {
          if (confirm) await runAction(confirm);
        }}
      />
    </div>
  );
}
