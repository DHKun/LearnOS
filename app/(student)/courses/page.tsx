import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3 } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireStudent } from "@/lib/auth/session";
import { PathCard } from "@/components/learning/path-card";
import { getCurrentEnrollment } from "@/lib/services/courses";
import { getStudentPaths } from "@/lib/services/paths";

export const metadata: Metadata = { title: "课程目录" };

export default async function CoursesPage() {
  const student = await requireStudent();
  const [{ paths, courses }, current] = await Promise.all([
    getStudentPaths(student.id),
    getCurrentEnrollment(student.id),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="课程目录"
        title="课程学习"
        description="按学习路线循序渐进，或直接挑选感兴趣的课程。"
      />

      {current && (
        <section className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                正在进行
              </p>
              <h2 className="mt-2 font-serif text-2xl font-semibold">{current.course.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{current.course.description}</p>
              <div className="mt-4 max-w-md">
                <Progress value={current.courseProgress.percent} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                已完成 {current.courseProgress.completed} / {current.courseProgress.total} 个必修章节
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={`/learn/${current.course.id}`}>
                继续学习
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {paths.length > 0 && (
        <section className="space-y-4" aria-labelledby="paths-heading">
          <div className="flex items-end justify-between">
            <h2 id="paths-heading" className="font-serif text-xl font-semibold">
              学习路线
            </h2>
            <p className="text-xs text-muted-foreground">按推荐顺序学习效果最好，也可以跳着学</p>
          </div>
          {paths.map((path) => (
            <PathCard key={path.slug} path={path} />
          ))}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-xl font-semibold">全部课程</h2>
          <p className="text-xs text-muted-foreground">{courses.length} 门已发布课程</p>
        </div>

        {courses.length === 0 ? (
          <EmptyState
            title="暂时没有已发布课程"
            description="管理员发布课程后会出现在这里。"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => {
              const isCurrent = course.myStatus === "active";
              const isCompleted = course.myStatus === "completed";
              return (
                <Card
                  key={course.id}
                  className={
                    isCurrent
                      ? "flex h-full flex-col border-primary/40"
                      : "flex h-full flex-col"
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={isCurrent ? "default" : "secondary"}>
                        {isCurrent ? "进行中" : isCompleted ? "已完成" : "可参加"}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <BookOpen className="size-3.5" />
                        {course.lessonCount} 章
                      </span>
                    </div>
                    <CardTitle className="mt-2 line-clamp-2 min-h-[3rem]">
                      {course.title}
                    </CardTitle>
                    <p className="line-clamp-2 min-h-[3.25rem] text-sm leading-relaxed text-muted-foreground">
                      {course.description}
                    </p>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-4">
                    <div className="flex min-h-[3rem] flex-col justify-center">
                      {course.myProgress ? (
                        <div>
                          <Progress value={course.myProgress.percent} />
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {course.myProgress.completed} / {course.myProgress.total} 必修章节
                          </p>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock3 className="size-3.5" /> 无截止时间
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end border-t border-border/70 pt-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/courses/${course.slug}`}>
                          查看
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {courses.some((course) => course.myStatus === "completed") && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" />
          已完成课程支持复习，不重复发放积分。
        </p>
      )}
    </div>
  );
}
