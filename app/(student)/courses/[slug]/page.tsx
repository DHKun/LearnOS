import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, FileText } from "lucide-react";

import { AbandonCourseButton, JoinCourseButton } from "@/components/learning/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireStudent } from "@/lib/auth/session";
import { getCourseDetailBySlug } from "@/lib/services/courses";
export const metadata: Metadata = { title: "课程详情" };

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const student = await requireStudent();
  const { slug } = await params;
  const detail = await getCourseDetailBySlug(slug, student.id);
  if (!detail) notFound();

  const { course, lessons, myEnrollment, myLessonProgress } = detail;
  const isActive = myEnrollment?.status === "active";
  const isCompleted = myEnrollment?.status === "completed";
  const isAbandoned = myEnrollment?.status === "abandoned";

  return (
    <div className="space-y-8">
      <Link href="/courses" className="text-sm text-muted-foreground hover:text-foreground">
        ← 返回课程目录
      </Link>

      <header className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{lessons.length} 个章节</Badge>
            <Badge variant="outline">无截止时间</Badge>
            {isCompleted && <Badge variant="success">已完成</Badge>}
            {isActive && <Badge variant="default">进行中</Badge>}
            {isAbandoned && <Badge variant="warning">已退出，可恢复</Badge>}
          </div>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-tight">
            {course.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {course.description}
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            内容版本 <span className="font-mono">{course.contentVersion}</span>
          </p>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>学习进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {myEnrollment ? (
              <>
                <Progress value={myEnrollment.progress.percent} />
                <p className="text-sm text-muted-foreground">
                  已完成 {myEnrollment.progress.completed} / {myEnrollment.progress.total} 个必修章节
                </p>
                {isActive && (
                  <Button asChild className="w-full">
                    <Link href={`/learn/${course.id}`}>
                      继续学习 <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                )}
                {isCompleted && (
                  <Button asChild className="w-full" variant="secondary">
                    <Link href={`/learn/${course.id}`}>复习课程</Link>
                  </Button>
                )}
                {isAbandoned && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      退出后进度、实验状态与笔记保留；重新参加后从原进度继续。
                    </p>
                    <JoinCourseButton
                      courseId={course.id}
                      label="恢复学习"
                    />
                  </>
                )}
                {isActive && <AbandonCourseButton enrollmentId={myEnrollment.id} />}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  参加后可开始学习。
                </p>
                <JoinCourseButton courseId={course.id} label="参加课程" size="lg" />
              </>
            )}
          </CardContent>
        </Card>
      </header>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-xl font-semibold">章节目录</h2>
          <p className="text-xs text-muted-foreground">必须完成全部必修章节才能结课</p>
        </div>
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {lessons.map((lesson, index) => {
            const progress = myLessonProgress[lesson.id];
            const completed = progress?.status === "completed";
            const inProgress = progress?.status === "in_progress";
            const content = (
              <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{lesson.title}</span>
                    {!lesson.required && <Badge variant="outline">选做</Badge>}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="size-3.5" />
                    {lesson.blocks && lesson.blocks.length > 0
                      ? `${lesson.blocks.length} 个互动内容`
                      : "图文阅读"}
                    {lesson.completion && lesson.completion.mode !== "manual" && " · 服务端验证"}
                  </p>
                </div>
                <span className="shrink-0">
                  {completed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="size-4" /> 已完成
                    </span>
                  ) : inProgress ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      <Circle className="size-3.5 fill-current" /> 学习中
                    </span>
                  ) : (
                    <Circle className="size-4 text-muted-foreground/40" />
                  )}
                </span>
              </div>
            );

            return (
              <li key={lesson.id}>
                {isActive || isCompleted ? (
                  <Link
                    href={`/learn/${course.id}?lesson=${lesson.id}`}
                    className="block transition-colors hover:bg-muted/60"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="opacity-80">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
