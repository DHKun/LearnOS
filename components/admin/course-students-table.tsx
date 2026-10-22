"use client";

import * as React from "react";
import Link from "next/link";

import { OnlineDot, StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
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
import { formatRelative } from "@/lib/utils";
import type { AdminCourseStudentRow, EnrollmentStatus } from "@/lib/types";

type ListResponse = {
  items: AdminCourseStudentRow[];
  total: number;
  page: number;
  pageSize: number;
};

const FILTERS: { value: "all" | EnrollmentStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "在学" },
  { value: "completed", label: "已完成" },
  { value: "abandoned", label: "已退出" },
];

export function CourseStudentsTable({
  courseId,
  initial,
}: {
  courseId: string;
  initial: ListResponse;
}) {
  const [filter, setFilter] = React.useState<"all" | EnrollmentStatus>("all");
  const [page, setPage] = React.useState(initial.page);
  const [data, setData] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);
  const pageSize = initial.pageSize || 20;

  const load = React.useCallback(
    async (next: "all" | EnrollmentStatus, nextPage = 1, silent = false) => {
      const requestId = ++requestRef.current;
      if (!silent) setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (next !== "all") params.set("status", next);
      try {
        const result = await apiFetch<ListResponse>(
          `/api/admin/courses/${courseId}/students?${params.toString()}`,
        );
        if (requestId !== requestRef.current) return;
        setData(result);
        setPage(result.page);
      } catch (caught) {
        if (requestId === requestRef.current) {
          setError(caught instanceof ApiClientError ? caught.message : "加载学员失败");
        }
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [courseId, pageSize],
  );

  usePolling(() => load(filter, page, true), 30_000);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={filter === item.value ? "default" : "outline"}
            onClick={() => {
              setFilter(item.value);
              void load(item.value, 1);
            }}
          >
            {item.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {loading ? "正在刷新…" : `${data.total} 条学习记录`}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>学生</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>当前章节</TableHead>
              <TableHead>最近在线</TableHead>
              <TableHead>最近交互</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  该筛选条件下没有学员。
                </TableCell>
              </TableRow>
            )}
            {data.items.map((row) => (
              <TableRow key={row.enrollmentId}>
                <TableCell>
                  <Link
                    href={`/admin/students/${row.studentId}`}
                    className="font-medium hover:text-primary"
                  >
                    {row.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">{row.email ?? "—"}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.enrollmentStatus} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${row.progress.percent}%` }} />
                    </div>
                    <span className="font-mono text-xs">
                      {row.progress.completed}/{row.progress.total}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.currentLesson ?? "—"}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {data.total} 条 · 第 {data.page} / {Math.max(1, Math.ceil(data.total / pageSize))} 页
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || loading}
            onClick={() => void load(filter, data.page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= Math.ceil(data.total / pageSize) || loading}
            onClick={() => void load(filter, data.page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
