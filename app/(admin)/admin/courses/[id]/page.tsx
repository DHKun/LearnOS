import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, FileText } from "lucide-react";

import { CourseStudentsTable } from "@/components/admin/course-students-table";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { listCourseStudents } from "@/lib/services/admin";
import { getAdminCourseDetail } from "@/lib/services/courses";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "课程详情" };

export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [detail, students] = await Promise.all([
    getAdminCourseDetail(id),
    listCourseStudents(id, { page: 1, pageSize: 20 }),
  ]);
  if (!detail) notFound();

  const statusLabel = {
    draft: "草稿",
    published: "已发布",
    archived: "已归档",
  }[detail.course.status];

  return (
    <div className="space-y-8">
      <Link href="/admin/courses" className="text-sm text-muted-foreground hover:text-foreground">
        ← 返回课程管理
      </Link>

      <PageHeader
        eyebrow={`课程 · ${detail.course.slug}`}
        title={detail.course.title}
        description={detail.course.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                detail.course.status === "published"
                  ? "success"
                  : detail.course.status === "draft"
                    ? "outline"
                    : "secondary"
              }
            >
              {statusLabel}
            </Badge>
            <Badge variant="secondary">版本 {detail.course.contentVersion}</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/courses/${id}/analytics`}>
                <BarChart3 /> 卡点分析
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">在学</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl font-semibold">{detail.counts.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">已完成</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl font-semibold">{detail.counts.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground">已退出</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl font-semibold">{detail.counts.abandoned}</p>
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>章节结构</CardTitle>
            <p className="text-xs text-muted-foreground">
              同步于 {formatDateTime(detail.course.updatedAt)} · 结构由仓库内容决定
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-border">
              {detail.lessons.map((lesson, index) => {
                return (
                  <li key={lesson.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {lesson.title}
                        {!lesson.required && (
                          <Badge variant="outline" className="ml-2">
                            选做
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <FileText className="size-3" />
                        章节 · {lesson.completionPolicy === "manual" ? "手动完成" : "服务端验证"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="font-serif text-xl font-semibold">课程学员</h2>
          <CourseStudentsTable courseId={id} initial={students} />
        </section>
      </section>
    </div>
  );
}
