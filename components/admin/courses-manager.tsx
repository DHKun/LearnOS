"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Pencil, Send, Archive } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import type { AdminCourseRow } from "@/lib/types";

const STATUS_LABEL = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
} as const;

export function CoursesManager({ initial }: { initial: AdminCourseRow[] }) {
  const [courses, setCourses] = React.useState(initial);
  const [editing, setEditing] = React.useState<AdminCourseRow | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirmCourse, setConfirmCourse] = React.useState<{
    course: AdminCourseRow;
    action: "publish" | "archive";
  } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<{ items: AdminCourseRow[] }>("/api/admin/courses");
      setCourses(data.items);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  async function update(courseId: string, patch: Record<string, unknown>) {
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMessage("课程信息已更新");
      await refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "更新失败");
      return false;
    }
  }

  function publish(course: AdminCourseRow) {
    setConfirmCourse({ course, action: "publish" });
  }

  function archive(course: AdminCourseRow) {
    setConfirmCourse({ course, action: "archive" });
  }

  async function confirmCourseAction() {
    if (!confirmCourse) return;
    const { course, action } = confirmCourse;
    await update(course.id, {
      status: action === "publish" ? "published" : "archived",
    });
  }

  return (
    <div className="space-y-5">
      <AutoRefresh />
      {(message || error) && (
        <p className={error ? "text-sm text-destructive" : "text-sm text-success"}>
          {error ?? message}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>课程</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>章节</TableHead>
              <TableHead>学员</TableHead>
              <TableHead>版本</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  还没有课程。运行 pnpm courses:sync 导入仓库课程。
                </TableCell>
              </TableRow>
            )}
            {courses.map((course) => (
              <TableRow key={course.id}>
                <TableCell>
                  <Link
                    href={`/admin/courses/${course.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {course.title}
                  </Link>
                  <p className="font-mono text-[11px] text-muted-foreground">{course.slug}</p>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      course.status === "published"
                        ? "success"
                        : course.status === "draft"
                          ? "outline"
                          : "secondary"
                    }
                  >
                    {STATUS_LABEL[course.status]}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{course.lessonCount}</TableCell>
                <TableCell className="text-sm">
                  <span>{course.enrollmentCount} 人</span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    （在学 {course.activeCount}）
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {course.contentVersion}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/courses/${course.id}`}>
                        详情 <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(course)}>
                      <Pencil className="size-3.5" /> 编辑
                    </Button>
                    {course.status !== "published" && (
                      <Button size="sm" onClick={() => void publish(course)} disabled={loading}>
                        <Send className="size-3.5" /> 发布
                      </Button>
                    )}
                    {course.status === "published" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void archive(course)}
                        disabled={loading}
                      >
                        <Archive className="size-3.5" /> 归档
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        课程内容由 Git 中的 course.json / MDX / 验证器维护，执行 <code>pnpm courses:sync</code> 同步。
        已有学习记录的课程不能原地改变必修结构，结构性升级请使用新 slug。
      </p>

      <ConfirmDialog
        open={confirmCourse !== null}
        onOpenChange={(open) => !open && setConfirmCourse(null)}
        title={
          confirmCourse?.action === "publish"
            ? `发布《${confirmCourse.course.title}》？`
            : `归档《${confirmCourse?.course.title ?? ""}》？`
        }
        description={
          confirmCourse?.action === "publish"
            ? "发布后会校验必修章节与最终测验，学生将可以看到该课程。"
            : "归档后不接受新学生，已有学生仍可完成课程。"
        }
        confirmLabel={confirmCourse?.action === "publish" ? "发布课程" : "归档课程"}
        destructive={confirmCourse?.action === "archive"}
        onConfirm={confirmCourseAction}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[min(94vw,36rem)]">
          {editing && (
            <CourseEditForm
              course={editing}
              onCancel={() => setEditing(null)}
              onSave={async (patch) => {
                const ok = await update(editing.id, patch);
                if (ok) setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CourseEditForm({
  course,
  onSave,
  onCancel,
}: {
  course: AdminCourseRow;
  onSave: (patch: { title: string; description: string; status: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(course.title);
  const [description, setDescription] = React.useState(course.description);
  const [status, setStatus] = React.useState(course.status);
  const [pending, setPending] = React.useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        await onSave({ title: title.trim(), description, status });
        setPending(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>编辑课程元信息</DialogTitle>
        <DialogDescription>
          只修改标题、简介和发布状态。章节内容与评分规则来自仓库内容，不在 UI 中编辑。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="course-title">标题</Label>
        <Input
          id="course-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={160}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="course-description">简介</Label>
        <Textarea
          id="course-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="course-status">状态</Label>
        <select
          id="course-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as AdminCourseRow["status"])}
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
        >
          <option value="draft">草稿（仅管理员可见）</option>
          <option value="published">已发布</option>
          <option value="archived">已归档（禁止新学生）</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}
