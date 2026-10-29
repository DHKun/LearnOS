import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, PageHeader, StatCard } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/session";
import { getCourseAnalytics } from "@/lib/services/analytics";
import type { CourseAnalyticsBlock } from "@/lib/types";

export const metadata: Metadata = { title: "课程卡点分析" };

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function Bar({ value, tone }: { value: number; tone: "reached" | "completed" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={tone === "reached" ? "h-full bg-primary/35" : "h-full bg-primary"}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function hardestBlocks(blocks: CourseAnalyticsBlock[]): CourseAnalyticsBlock[] {
  const position = new Map(blocks.map((block, index) => [block, index]));
  return blocks
    .slice()
    .sort(
      (a, b) =>
        b.stuck - a.stuck ||
        (b.avgAttemptsToPass ?? 0) - (a.avgAttemptsToPass ?? 0) ||
        position.get(a)! - position.get(b)!,
    );
}

export default async function AdminCourseAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const analytics = await getCourseAnalytics(id);
  if (!analytics) notFound();

  const { learners, lessons, questions, idleDays } = analytics;
  const blocks = hardestBlocks(analytics.blocks);
  const waitingTop = lessons.reduce<(typeof lessons)[number] | null>(
    (top, lesson) => (lesson.waiting > (top?.waiting ?? 0) ? lesson : top),
    null,
  );
  const stuckTop = blocks[0] && blocks[0].stuck > 0 ? blocks[0] : null;

  return (
    <div className="space-y-8">
      <Link
        href={`/admin/courses/${id}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 返回课程详情
      </Link>

      <PageHeader
        eyebrow={`卡点分析 · ${analytics.course.slug}`}
        title={analytics.course.title}
        description="按章节、实验和题目汇总全部学员的学习记录，找出大家停下来或反复出错的地方。这里只统计人数和次数，不显示学员姓名和笔记。"
      />

      {learners.total === 0 ? (
        <EmptyState title="还没有学员参加这门课" description="有人报名并开始学习后，这里会出现统计。" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="参加人数"
              value={learners.total}
              hint={`在学 ${learners.active} · 已完成 ${learners.completed} · 已退出 ${learners.abandoned}`}
            />
            <StatCard
              label="结课率"
              value={`${percent(learners.completed, learners.total)}%`}
              hint={`${learners.completed} / ${learners.total} 人完成全部必修章节`}
            />
            <StatCard
              label="停留最多的章节"
              value={waitingTop ? `${waitingTop.waiting} 人` : "—"}
              hint={waitingTop ? waitingTop.title : "没有在学学员停在某一章"}
              accent={Boolean(waitingTop)}
            />
            <StatCard
              label="卡住最多的练习"
              value={stuckTop ? `${stuckTop.stuck} 人` : "—"}
              hint={stuckTop ? stuckTop.title : "尝试过的人都已通过"}
              accent={Boolean(stuckTop)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>章节进度</CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">
                「进入」指打开过这一章，「完成」指达到了完成条件。「停在这里」统计在学学员中，
                这一章是他们第一个还没完成的必修章节的人数；括号里是其中 {idleDays} 天没有学习操作的人数。
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table data-testid="analytics-lessons">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-5">#</TableHead>
                    <TableHead className="min-w-48">章节</TableHead>
                    <TableHead className="min-w-36 whitespace-nowrap">进入 / 完成</TableHead>
                    <TableHead className="whitespace-nowrap text-right">完成率</TableHead>
                    <TableHead className="whitespace-nowrap pr-5 text-right">停在这里</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lessons.map((lesson, index) => (
                    <TableRow key={lesson.id} data-testid={`analytics-lesson-${index + 1}`}>
                      <TableCell className="pl-5 font-mono text-xs text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{lesson.title}</span>
                        {!lesson.required && (
                          <Badge variant="outline" className="ml-2">
                            选做
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Bar value={percent(lesson.reached, learners.total)} tone="reached" />
                          <Bar value={percent(lesson.completed, learners.total)} tone="completed" />
                          <p className="font-mono text-[11px] text-muted-foreground">
                            <span data-testid="reached">{lesson.reached}</span> 进入 ·{" "}
                            <span data-testid="completed">{lesson.completed}</span> 完成
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {lesson.reached === 0 ? "—" : `${percent(lesson.completed, lesson.reached)}%`}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {lesson.waiting === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span
                            data-testid="waiting"
                            className={
                              lesson === waitingTop
                                ? "rounded bg-warning/20 px-1.5 py-0.5 font-mono text-sm font-semibold"
                                : "font-mono text-sm"
                            }
                          >
                            {lesson.waiting}
                            {lesson.idle > 0 && (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                （{lesson.idle}）
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>实验与知识检查</CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">
                按「尝试过但还没通过」的人数排序。「平均几次通过」只算已通过的人，数到第一次通过为止；
                「一次通过」是第一次提交就通过的人占尝试人数的比例。
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {blocks.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">这门课没有需要提交的练习。</p>
              ) : (
                <Table data-testid="analytics-blocks">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56 pl-5">练习</TableHead>
                      <TableHead className="whitespace-nowrap text-right">尝试人数</TableHead>
                      <TableHead className="whitespace-nowrap text-right">已通过</TableHead>
                      <TableHead className="whitespace-nowrap text-right">未通过</TableHead>
                      <TableHead className="whitespace-nowrap text-right">平均几次通过</TableHead>
                      <TableHead className="whitespace-nowrap pr-5 text-right">一次通过</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocks.map((block) => (
                      <TableRow
                        key={`${block.lessonId}:${block.blockId}`}
                        data-testid={`analytics-block-${block.blockId}`}
                      >
                        <TableCell className="pl-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{block.title}</span>
                            <Badge variant="secondary">
                              {block.kind === "simulation" ? "实验" : "知识检查"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{block.lessonTitle}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid="learners">
                          {block.learners}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid="passed">
                          {block.passed}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid="stuck">
                          {block.stuck > 0 ? (
                            <span className="rounded bg-warning/20 px-1.5 py-0.5 font-semibold">{block.stuck}</span>
                          ) : (
                            block.stuck
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid="avg">
                          {block.avgAttemptsToPass ?? "—"}
                        </TableCell>
                        <TableCell className="pr-5 text-right font-mono text-xs" data-testid="first-try">
                          {block.firstTryRate === null ? "—" : `${block.firstTryRate}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div>
              <h2 className="font-serif text-xl font-semibold">错得最多的题目</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                统计知识检查的每一次提交，按答错次数排序，最多列 10 题。错误选项从本版本起开始记录，
                更早的错误只计入次数。
              </p>
            </div>
            {questions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">
                还没有答错的题目。
              </p>
            ) : (
              <ol className="space-y-3" data-testid="analytics-questions">
                {questions.map((question) => (
                  <li
                    key={`${question.blockTitle}:${question.questionId}`}
                    className="rounded-xl border border-border bg-card p-4"
                    data-testid={`analytics-question-${question.questionId}`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-relaxed">{question.prompt}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {question.lessonTitle} · {question.blockTitle}
                        </p>
                      </div>
                      <p className="shrink-0 font-mono text-xs">
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 font-semibold" data-testid="wrong-rate">
                          {question.wrongRate}%
                        </span>{" "}
                        <span className="text-muted-foreground">
                          错 {question.wrong} / {question.answered} 次
                        </span>
                      </p>
                    </div>
                    {(question.wrongChoices.length > 0 || question.unrecordedWrong > 0) && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {question.wrongChoices.map((choice) => (
                          <li
                            key={choice.label}
                            className="rounded-md bg-muted px-2 py-1 text-xs"
                            data-testid="wrong-choice"
                          >
                            选了「{choice.label}」<span className="ml-1 font-mono">{choice.count}</span>
                          </li>
                        ))}
                        {question.unrecordedWrong > 0 && (
                          <li className="rounded-md px-2 py-1 text-xs text-muted-foreground">
                            未记录选项 {question.unrecordedWrong}
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
