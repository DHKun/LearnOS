import Link from "next/link";
import { CheckCircle2, Circle, FileText, FlaskConical, ListChecks } from "lucide-react";

import { LessonOutline } from "@/components/learning/lesson-outline";
import { LinkPending } from "@/components/link-pending";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CourseProgress, LessonSummary, MyLessonProgress } from "@/lib/types";
import type { LessonHeading } from "@/lib/content/headings";

const TYPE_ICON = {
  article: FileText,
  interactive: FlaskConical,
  quiz: ListChecks,
} as const;

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
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <Link
          href={`/courses`}
          className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← 课程目录
        </Link>
        <h1 className="mt-2 font-serif text-lg font-semibold leading-snug">{courseTitle}</h1>
        <div className="mt-3">
          <Progress value={progress.percent} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {progress.completed} / {progress.total} 必修章节
        </p>
      </div>

      <nav aria-label="章节目录" className="overflow-hidden rounded-xl border border-border bg-card">
        <ol className="divide-y divide-border">
          {lessons.map((lesson, index) => {
            const status = lessonProgress[lesson.id]?.status ?? "not_started";
            const active = lesson.id === currentLessonId;
            const Icon = TYPE_ICON[lesson.type];
            return (
              <li key={lesson.id}>
                <Link
                  href={`/learn/${courseId}?lesson=${lesson.id}`}
                  prefetch
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-3 text-sm transition-colors",
                    active ? "bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <LinkPending className="text-primary" />
                    {status === "completed" ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : status === "in_progress" ? (
                      <Circle className="size-3.5 fill-primary text-primary" />
                    ) : (
                      <Circle className="size-3.5 text-muted-foreground/40" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block leading-snug",
                        active ? "font-medium text-primary" : "text-foreground",
                      )}
                    >
                      {String(index + 1).padStart(2, "0")} · {lesson.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3" />
                      {lesson.type === "article"
                        ? "图文"
                        : lesson.type === "interactive"
                          ? "互动实验"
                          : "测验"}
                      {!lesson.required && " · 选做"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <LessonOutline headings={outline} />
    </div>
  );
}
