"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, ListChecks, ShieldCheck } from "lucide-react";

import { CompleteLessonButton } from "@/components/learning/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChapterLearning } from "@/lib/learning/chapter-context";
import type {
  BlockResultSummary,
  ChapterBlockSummary,
  ChapterCompletionSummary,
  LessonSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChapterProgress({
  lessonId,
  enrollmentId,
  completion,
  blocks,
  blockResults,
  completed,
  readOnly,
  courseId,
  nextLesson,
}: {
  lessonId: string;
  enrollmentId: string;
  completion: ChapterCompletionSummary;
  blocks: ChapterBlockSummary[];
  blockResults: Record<string, BlockResultSummary>;
  completed: boolean;
  readOnly: boolean;
  courseId: string;
  nextLesson?: LessonSummary | null;
}) {
  // The provider owns live block results and completion so this panel never
  // renders stale initial server props after an in-chapter submission.
  const chapter = useChapterLearning();
  const results = chapter.blockResults ?? blockResults;
  const isCompleted = chapter.chapterCompleted || completed;

  const required = completion.requiredBlocks
    .map((id) => blocks.find((block) => block.id === id))
    .filter((block): block is ChapterBlockSummary => Boolean(block));
  const passedCount = required.filter((block) => results[block.id]?.passed === true).length;

  return (
    <section className="mt-6 space-y-4 border-t border-border pt-5" aria-label="本章完成条件">
      {isCompleted && (
        <div
          data-testid="chapter-completed-banner"
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">本章已完成</p>
              <p className="text-xs text-muted-foreground">
                进度与积分已同步，可以自主进入下一章，不会被强制跳转。
              </p>
            </div>
          </div>
          {nextLesson && (
            <Button asChild size="sm" className="shrink-0">
              <Link href={`/learn/${courseId}?lesson=${nextLesson.id}`}>
                进入下一章：{nextLesson.title} <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="size-3" /> 章节完成
        </Badge>
        {completion.mode === "manual" ? (
          <span className="text-xs text-muted-foreground">手动完成</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {completion.mode === "all" ? "全部必需内容通过" : "任意一项必需内容通过"}
          </span>
        )}
        {required.length > 0 && (
          <span className="text-xs text-muted-foreground">
            已通过 {passedCount} / {required.length}
          </span>
        )}
        {isCompleted && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> 已完成
          </Badge>
        )}
      </div>

      {required.length > 0 && (
        <ul className="space-y-2">
          {required.map((block) => {
            const passed = results[block.id]?.passed === true;
            return (
              <li
                key={block.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm",
                  passed && "border-success/40 bg-success/5",
                )}
                data-block-result={block.id}
                data-passed={passed ? "true" : "false"}
              >
                <span className="flex items-center gap-2">
                  {passed ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/50" />
                  )}
                  <span>{block.title ?? block.id}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {block.kind === "simulation" ? "模拟实验" : "知识检查"}
                  </span>
                </span>
                <span className={passed ? "text-xs text-success" : "text-xs text-muted-foreground"}>
                  {passed ? "已通过" : "未通过"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {completion.mode === "manual" && blocks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          本章还包含 {blocks.length} 个可选互动内容，不参与正式完成判定。
        </p>
      )}

      {completion.mode !== "manual" && !isCompleted && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ListChecks className="size-3.5" />
          完成条件由服务端根据已验证的 Block 结果计算，满足后自动完成本章并发放首次完成积分。
        </p>
      )}

      {completion.mode === "manual" && (
        <div className="flex flex-col gap-2">
          {readOnly ? (
            <p className="text-sm text-muted-foreground">复习模式不记录新的完成状态。</p>
          ) : isCompleted ? null : (
            <CompleteLessonButton
              key={lessonId}
              lessonId={lessonId}
              enrollmentId={enrollmentId}
              completed={isCompleted}
              onCompleted={chapter.markChapterCompleted}
            />
          )}
        </div>
      )}
    </section>
  );
}
