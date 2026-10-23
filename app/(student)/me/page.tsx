import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Award, BookOpen, CalendarDays, History } from "lucide-react";

import { EmptyState, PageHeader, StatCard } from "@/components/page";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireStudent } from "@/lib/auth/session";
import { getCurrentEnrollment, getEnrollmentHistory } from "@/lib/services/courses";
import { getPoints } from "@/lib/services/points";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "我的学习" };

const REASON_LABEL: Record<string, string> = {
  lesson_completed: "完成章节",
  final_quiz_passed: "通过最终测验",
};

export default async function MePage() {
  const student = await requireStudent();
  const [current, history, points] = await Promise.all([
    getCurrentEnrollment(student.id),
    getEnrollmentHistory(student.id),
    getPoints(student.id),
  ]);

  const completedCourses = history.filter((item) => item.status === "completed");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="个人中心"
        title={student.displayName}
        description={student.email ?? "未设置邮箱"}
        actions={
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">总积分</p>
            <p className="font-serif text-3xl font-semibold tabular-nums">{points.total}</p>
          </div>
        }
      />

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/account/connections">账号与登录方式</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="已完成课程" value={completedCourses.length} hint="支持复习" />
        <StatCard label="学习记录" value={history.length} hint="含进行中与已退出" />
        <StatCard
          label="积分记录"
          value={points.items.length}
          hint="章节首次完成 +10，最终测验首次通过 +50"
        />
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
          <BookOpen className="size-4" /> 当前课程
        </h2>
        {current ? (
          <Card className="border-primary/30">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg font-semibold">{current.course.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  已完成 {current.courseProgress.completed} / {current.courseProgress.total} 个必修章节
                </p>
                <div className="mt-3 max-w-md">
                  <Progress value={current.courseProgress.percent} />
                </div>
              </div>
              <Button asChild>
                <Link href={`/learn/${current.course.id}`}>
                  继续学习 <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title="当前没有进行中的课程"
            description="可从课程目录选择课程参加。"
            action={
              <Button asChild>
                <Link href="/courses">浏览课程</Link>
              </Button>
            }
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <History className="size-4" /> 课程历史
          </h2>
          <Card>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">还没有学习记录。</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((item) => (
                    <li key={item.enrollmentId} className="space-y-2 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/courses/${item.course.slug}`}
                          className="font-medium hover:text-primary"
                        >
                          {item.course.title}
                        </Link>
                        <StatusBadge status={item.status} />
                      </div>
                      <Progress value={item.progress.percent} />
                      <p className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          开始 {formatDateTime(item.startedAt)}
                        </span>
                        {item.completedAt && (
                          <span className="inline-flex items-center gap-1 text-success">
                            <Award className="size-3" /> 完成 {formatDateTime(item.completedAt)}
                          </span>
                        )}
                        <span>
                          {item.progress.completed} / {item.progress.total} 必修章节
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <Award className="size-4" /> 积分流水
          </h2>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between">
                <CardTitle className="text-base">累计积分</CardTitle>
                <span className="font-serif text-2xl font-semibold tabular-nums">{points.total}</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {points.items.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  完成章节后积分会出现在这里。
                </p>
              ) : (
                <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
                  {points.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="text-sm">{REASON_LABEL[item.reason] ?? item.reason}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <Badge variant="success">+{item.delta}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
