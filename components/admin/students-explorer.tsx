"use client";

import * as React from "react";
import { KeyRound, Lock, Search, Unlock, UserPlus } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { OnlineDot, StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { AdminStudentDetail, AdminStudentRow } from "@/lib/types";

type ListResponse = {
  items: AdminStudentRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function StudentsExplorer({
  initial,
  initialStudentId,
}: {
  initial: ListResponse;
  initialStudentId?: string;
}) {
  const [rows, setRows] = React.useState(initial.items);
  const [total, setTotal] = React.useState(initial.total);
  const [page, setPage] = React.useState(initial.page);
  const [query, setQuery] = React.useState("");
  const [online, setOnline] = React.useState<"all" | "true" | "false">("all");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(initialStudentId ?? null);
  const [detail, setDetail] = React.useState<AdminStudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);

  const pageSize = initial.pageSize;

  const load = React.useCallback(
    async (next: { page?: number; q?: string; online?: "all" | "true" | "false" } = {}) => {
      setLoading(true);
      setError(null);
      const nextPage = next.page ?? 1;
      const nextQuery = next.q ?? query;
      const nextOnline = next.online ?? online;
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      if (nextOnline !== "all") params.set("online", nextOnline);

      try {
        const data = await apiFetch<ListResponse>(`/api/admin/students?${params.toString()}`);
        setRows(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (caught) {
        setError(caught instanceof ApiClientError ? caught.message : "加载学生失败");
      } finally {
        setLoading(false);
      }
    },
    [online, pageSize, query],
  );

  const loadDetail = React.useCallback(async (studentId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setActionMessage(null);
    try {
      const data = await apiFetch<AdminStudentDetail>(`/api/admin/students/${studentId}`);
      setDetail(data);
    } catch (caught) {
      setDetailError(caught instanceof ApiClientError ? caught.message : "加载详情失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialStudentId) void loadDetail(initialStudentId);
  }, [initialStudentId, loadDetail]);

  function openStudent(id: string) {
    setSelectedId(id);
    setDetail(null);
    void loadDetail(id);
  }

  async function toggleDisabled() {
    if (!detail) return;
    const next = !detail.student.disabled;
    if (!window.confirm(next ? "确定停用该学生账号？业务接口会立即拒绝其访问。" : "确定重新启用该账号？")) {
      return;
    }
    try {
      await apiFetch(`/api/admin/students/${detail.student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled: next }),
      });
      setActionMessage(next ? "账号已停用" : "账号已启用");
      await loadDetail(detail.student.id);
      await load({ page });
    } catch (caught) {
      setActionMessage(caught instanceof ApiClientError ? caught.message : "操作失败");
    }
  }

  async function resetPassword() {
    if (!detail) return;
    if (!window.confirm("向该学生邮箱发送密码重置邮件？")) return;
    try {
      await apiFetch(`/api/admin/students/${detail.student.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActionMessage("密码重置邮件已请求发送（本地环境可在 Mailpit 查看）");
    } catch (caught) {
      setActionMessage(caught instanceof ApiClientError ? caught.message : "发送失败");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load({ page: 1, q: query });
          }}
        >
          <div className="flex-1">
            <Label htmlFor="q" className="text-xs">
              搜索姓名或邮箱
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入关键词"
                className="pl-8"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={loading}>
            查询
          </Button>
        </form>

        <div>
          <Label htmlFor="online" className="text-xs">
            在线状态
          </Label>
          <select
            id="online"
            value={online}
            onChange={(event) => {
              const value = event.target.value as "all" | "true" | "false";
              setOnline(value);
              void load({ page: 1, online: value });
            }}
            className="mt-1 h-9 w-36 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="all">全部</option>
            <option value="true">最近在线</option>
            <option value="false">离线</option>
          </select>
        </div>

        <Button
          onClick={() => {
            setSelectedId("new");
            setDetail(null);
            setDetailError(null);
          }}
          className="sm:mb-0"
        >
          <UserPlus className="size-4" /> 创建学生
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>学生</TableHead>
              <TableHead>当前课程</TableHead>
              <TableHead>当前章节</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>最近在线</TableHead>
              <TableHead>最近交互</TableHead>
              <TableHead className="text-right">积分</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  没有匹配的学生。
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => openStudent(row.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    {row.disabled && <Badge variant="destructive">已停用</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{row.email ?? "—"}</span>
                </TableCell>
                <TableCell>
                  {row.activeCourse ? (
                    <div className="flex flex-col gap-0.5">
                      <span>{row.activeCourse.title}</span>
                      <StatusBadge status={row.enrollmentStatus} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">无进行中课程</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.currentLesson ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${row.progress}%` }} />
                    </div>
                    <span className="font-mono text-xs">{row.progress}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <OnlineDot online={row.online} />
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelative(row.lastSeenAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelative(row.lastInteractionAt)}
                </TableCell>
                <TableCell className="text-right font-mono">{row.points}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 名学生 · 第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void load({ page: page - 1 })}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => void load({ page: page + 1 })}
          >
            下一页
          </Button>
        </div>
      </div>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setDetail(null);
            setDetailError(null);
          }
        }}
      >
        <DialogContent>
          {selectedId === "new" ? (
            <CreateStudentForm
              onCreated={async () => {
                setSelectedId(null);
                await load({ page: 1, q: "" });
              }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{detail?.student.name ?? "学生详情"}</DialogTitle>
                <DialogDescription>
                  {detailLoading
                    ? "正在加载…"
                    : detail
                      ? `${detail.student.email ?? "无邮箱"} · 注册于 ${formatDateTime(detail.student.createdAt)}`
                      : detailError ?? "选择一名学生查看详情"}
                </DialogDescription>
              </DialogHeader>

              {detail && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={detail.student.disabled ? "destructive" : "success"}>
                      {detail.student.disabled ? "已停用" : "正常"}
                    </Badge>
                    <Badge variant="secondary">积分 {detail.student.points}</Badge>
                    {detail.current && <StatusBadge status={detail.current.status} />}
                    {detail.current && <OnlineDot online={detail.current.online} />}
                    <div className="ml-auto flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void resetPassword()}>
                        <KeyRound className="size-3.5" /> 重置密码
                      </Button>
                      <Button
                        variant={detail.student.disabled ? "default" : "destructive"}
                        size="sm"
                        onClick={() => void toggleDisabled()}
                      >
                        {detail.student.disabled ? (
                          <>
                            <Unlock className="size-3.5" /> 启用
                          </>
                        ) : (
                          <>
                            <Lock className="size-3.5" /> 停用
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {actionMessage && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs">{actionMessage}</p>
                  )}

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">当前课程</h3>
                    {detail.current ? (
                      <div className="rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{detail.current.courseTitle}</p>
                          <span className="font-mono text-xs text-muted-foreground">
                            {detail.current.progress.percent}%
                          </span>
                        </div>
                        <div className="mt-2">
                          <Progress value={detail.current.progress.percent} />
                        </div>
                        <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            <dt className="inline">当前章节：</dt>
                            <dd className="inline">{detail.current.currentLesson ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">必修完成：</dt>
                            <dd className="inline">
                              {detail.current.progress.completed} / {detail.current.progress.total}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">最近在线：</dt>
                            <dd className="inline">{formatDateTime(detail.current.lastSeenAt)}</dd>
                          </div>
                          <div>
                            <dt className="inline">最近交互：</dt>
                            <dd className="inline">
                              {formatDateTime(detail.current.lastInteractionAt)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">当前没有进行中的课程。</p>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">必修章节进度</h3>
                    {detail.lessons.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暂无章节记录。</p>
                    ) : (
                      <ul className="divide-y divide-border rounded-lg border border-border">
                        {detail.lessons.map((lesson) => (
                          <li
                            key={lesson.lessonId}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <span>
                              <span className="mr-2 font-mono text-xs text-muted-foreground">
                                {String(lesson.position + 1).padStart(2, "0")}
                              </span>
                              {lesson.title}
                              {!lesson.required && (
                                <Badge variant="outline" className="ml-2">
                                  选做
                                </Badge>
                              )}
                            </span>
                            <span className="flex items-center gap-2 text-xs">
                              <Badge
                                variant={
                                  lesson.status === "completed"
                                    ? "success"
                                    : lesson.status === "in_progress"
                                      ? "default"
                                      : "outline"
                                }
                              >
                                {lesson.status === "completed"
                                  ? "已完成"
                                  : lesson.status === "in_progress"
                                    ? "进行中"
                                    : "未开始"}
                              </Badge>
                              {lesson.completionSource && (
                                <span className="font-mono text-muted-foreground">
                                  {lesson.completionSource}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">最近交互事件（最多 50 条）</h3>
                    {detail.recentEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暂无交互事件。</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>时间</TableHead>
                              <TableHead>类型</TableHead>
                              <TableHead>步骤</TableHead>
                              <TableHead>载荷</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.recentEvents.map((event) => (
                              <TableRow key={event.id}>
                                <TableCell className="whitespace-nowrap text-xs">
                                  {formatDateTime(event.createdAt)}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{event.type}</TableCell>
                                <TableCell className="text-xs">{event.stepId ?? "—"}</TableCell>
                                <TableCell className="max-w-[16rem] truncate font-mono text-[11px] text-muted-foreground">
                                  {JSON.stringify(event.payload)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">课程历史</h3>
                      {detail.history.length === 0 ? (
                        <p className="text-sm text-muted-foreground">暂无记录。</p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {detail.history.map((item) => (
                            <li
                              key={item.enrollmentId}
                              className="flex items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5"
                            >
                              <span className="truncate">{item.courseTitle}</span>
                              <span className="flex items-center gap-1 text-xs">
                                <StatusBadge status={item.status} />
                                <span className="font-mono">{item.progress.percent}%</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">积分流水</h3>
                      {detail.pointEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">暂无积分。</p>
                      ) : (
                        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                          {detail.pointEvents.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-2 border-b border-border pb-1"
                            >
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(item.createdAt)}
                              </span>
                              <span>{item.reason === "final_quiz_passed" ? "最终测验" : "章节完成"}</span>
                              <span className="font-mono text-success">+{item.delta}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                  <p className="text-[11px] text-muted-foreground">
                    管理员默认无法读取学生私人笔记。
                  </p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateStudentForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ email: string; password: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          initialPassword: password,
        }),
      });
      setCreated({ email: email.trim(), password });
      setEmail("");
      setDisplayName("");
      setPassword("");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "创建失败");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>学生账号已创建</DialogTitle>
          <DialogDescription>
            请通过安全渠道把初始凭据交给学生，并建议首次登录后修改密码。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm">
          <p>邮箱：{created.email}</p>
          <p>初始密码：{created.password}</p>
        </div>
        <Button onClick={() => void onCreated()}>完成</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>创建学生账号</DialogTitle>
        <DialogDescription>
          创建 student 角色账号。账号立即生效，可在学生详情中停用。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="new-name">姓名</Label>
        <Input
          id="new-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">邮箱</Label>
        <Input
          id="new-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={320}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">初始密码（至少 8 位）</Label>
        <Input
          id="new-password"
          type="text"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "正在创建…" : "创建账号"}
      </Button>
    </form>
  );
}
