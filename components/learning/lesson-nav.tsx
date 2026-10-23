import Link from "next/link";
import { CheckCircle2, Circle, CirclePlay } from "lucide-react";

import { LessonOutline } from "@/components/learning/lesson-outline";
import { PrefetchOnHover } from "@/components/learning/prefetch-on-hover";
import { LinkPending } from "@/components/link-pending";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CourseProgress, LessonProgressStatus, LessonSummary, MyLessonProgress } from "@/lib/types";
import type { LessonHeading } from "@/lib/content/headings";

const STATUS_META: Record<
  LessonProgressStatus,
  { label: string; icon: typeof Circle; className: string }
> = {
  completed: { label: "已完成", icon: CheckCircle2, className: "text-success" },
  in_progress: { label: "学习中", icon: CirclePlay, className: "text-primary" },
  not_started: { label: "未开始", icon: Circle, className: "text-muted-foreground/60" },
};

export function LessonNav({
  courseId,
  courseTitle,
  lessons,
  currentLessonId,
  progress,
  lessonProgress,
  outline = [],
}: {
  courseId: string;
  courseTitle: string;
  lessons: LessonSummary[];
  currentLessonId: string;
  progress: CourseProgress;
  lessonProgress: MyLessonProgress;
  outline?: LessonHeading[];
}) {
  const currentIndex = lessons.findIndex((lesson) => lesson.id === currentLessonId);
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4" aria-label="课程信息">
        <Link
          href={`/courses`}
          className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← 全部课程
        </Link>
        <h1 className="mt-2 font-serif text-lg font-semibold leading-snug">{courseTitle}</h1>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">课程进度</span>
          <span data-testid="course-progress-text" className="font-medium tabular-nums">
            {progress.completed} / {progress.total} 必修章节
          </span>
        </div>
        <Progress className="mt-1.5" value={progress.percent} />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {progress.percent}% · 共 {lessons.length} 章
        </p>
      </section>

      <nav
        aria-label="课程章节"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
            课程章节
          </h2>
          <span className="text-[11px] text-muted-foreground">共 {lessons.length} 章</span>
        </div>
        <PrefetchOnHover>
        <ol>
          {lessons.map((lesson, index) => {
            const status: LessonProgressStatus = lessonProgress[lesson.id]?.status ?? "not_started";
            const active = lesson.id === currentLessonId;
            // The current chapter is being studied even before the first
            // heartbeat/progress write; surface that immediately.
            const displayStatus: LessonProgressStatus =
              active && status !== "completed" ? "in_progress" : status;
            const meta = STATUS_META[displayStatus];
            const StatusIcon = meta.icon;
            const showUnit = Boolean(lesson.unit) && lessons[index - 1]?.unit !== lesson.unit;
            return (
              <li key={lesson.id}>
                {showUnit && (
                  <p className="border-y border-border/60 bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground first:border-t-0">
                    单元 · {lesson.unit}
                  </p>
                )}
                <Link
                  href={`/learn/${courseId}?lesson=${lesson.id}`}
                  // Prefetch only the next chapter automatically. Other
                  // chapters are prefetched on hover/touchstart, so the first
                  // load no longer fires a concurrent RSC render per chapter.
                  prefetch={index === currentIndex + 1}
                  aria-current={active ? "page" : undefined}
                  data-status={displayStatus}
                  className={cn(
                    "flex items-start gap-2.5 border-l-2 px-3 py-3 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted/60",
                  )}
                >
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <LinkPending className="text-primary" />
                    <StatusIcon className={cn("size-4", meta.className)} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        第 {index + 1} 章
                      </span>
                      {!lesson.required && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                          选做
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block break-words text-sm leading-snug",
                        active ? "font-medium text-primary" : "text-foreground",
                      )}
                    >
                      {lesson.title}
                    </span>
                    <span className={cn("mt-1 flex items-center gap-1 text-[11px]", meta.className)}>
                      <StatusIcon className="size-3" aria-hidden />
                      {meta.label}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        </PrefetchOnHover>
      </nav>

      <LessonOutline headings={outline} />
    </div>
  );
}
