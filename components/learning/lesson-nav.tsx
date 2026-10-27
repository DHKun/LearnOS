"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, CirclePlay } from "lucide-react";

import { LessonOutline } from "@/components/learning/lesson-outline";
import { PrefetchOnHover } from "@/components/learning/prefetch-on-hover";
import { LinkPending } from "@/components/link-pending";
import { Progress } from "@/components/ui/progress";
import type { LessonHeading } from "@/lib/content/headings";
import { cn } from "@/lib/utils";
import type { CourseProgress, LessonProgressStatus, LessonSummary, MyLessonProgress } from "@/lib/types";

const STATUS_META: Record<
  LessonProgressStatus,
  { label: string; icon: typeof Circle; className: string }
> = {
  completed: { label: "已完成", icon: CheckCircle2, className: "text-success" },
  in_progress: { label: "学习中", icon: CirclePlay, className: "text-primary" },
  not_started: { label: "未开始", icon: Circle, className: "text-muted-foreground/60" },
};

type Group = { unit: string | null; lessons: { lesson: LessonSummary; index: number }[] };

/** Consecutive lessons sharing a `unit` form one collapsible group. */
function groupLessons(lessons: LessonSummary[]): Group[] {
  const groups: Group[] = [];
  lessons.forEach((lesson, index) => {
    const unit = lesson.unit || null;
    const last = groups.at(-1);
    if (last && last.unit === unit) last.lessons.push({ lesson, index });
    else groups.push({ unit, lessons: [{ lesson, index }] });
  });
  return groups;
}

/**
 * Expanded/collapsed choices for units other than the current one, kept per
 * course in this browser. A convenience only: without storage the directory
 * simply starts with the current unit open.
 */
function useRememberedUnits(courseId: string) {
  const key = `learnos:nav-units:${courseId}`;
  const [remembered, setRemembered] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setRemembered(
          Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
          ),
        );
      }
    } catch {
      // Private mode or blocked storage: fall back to the default layout.
    }
  }, [key]);

  const remember = React.useCallback(
    (unit: string, open: boolean) => {
      setRemembered((current) => {
        const next = { ...current, [unit]: open };
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Ignore: the choice still applies for this page view.
        }
        return next;
      });
    },
    [key],
  );

  return [remembered, remember] as const;
}

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
  const groups = React.useMemo(() => groupLessons(lessons), [lessons]);
  // Only courses with several units get collapsible groups.
  const grouped = groups.filter((group) => group.unit).length >= 2;
  const currentUnit = lessons[currentIndex]?.unit || null;

  const [remembered, remember] = useRememberedUnits(courseId);
  // The current unit always opens when the chapter changes, so the current
  // chapter is never hidden; collapsing it only lasts for this page view.
  const [currentUnitOpen, setCurrentUnitOpen] = React.useState(true);
  React.useEffect(() => setCurrentUnitOpen(true), [currentLessonId]);

  const isOpen = (unit: string | null) => {
    if (!grouped || !unit) return true;
    if (unit === currentUnit) return currentUnitOpen;
    return remembered[unit] ?? false;
  };
  const toggle = (unit: string) => {
    if (unit === currentUnit) setCurrentUnitOpen((open) => !open);
    else remember(unit, !isOpen(unit));
  };

  // Bring the current chapter into view inside the directory's own scroll
  // area without scrolling the page itself.
  const activeRef = React.useRef<HTMLAnchorElement>(null);
  React.useEffect(() => {
    const item = activeRef.current;
    const scroller = item?.closest<HTMLElement>("[data-nav-scroll]");
    if (!item || !scroller) return;
    const top = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 80) {
      scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3);
    }
  }, [currentLessonId]);

  const renderLesson = ({ lesson, index }: { lesson: LessonSummary; index: number }) => {
    const status: LessonProgressStatus = lessonProgress[lesson.id]?.status ?? "not_started";
    const active = lesson.id === currentLessonId;
    // The current chapter is being studied even before the first
    // heartbeat/progress write; surface that immediately.
    const displayStatus: LessonProgressStatus = active && status !== "completed" ? "in_progress" : status;
    const meta = STATUS_META[displayStatus];
    const StatusIcon = meta.icon;
    return (
      <li key={lesson.id}>
        <Link
          ref={active ? activeRef : undefined}
          href={`/learn/${courseId}?lesson=${lesson.id}`}
          // Prefetch only the next chapter automatically. Other chapters are
          // prefetched on hover/touchstart, so the first load no longer fires
          // a concurrent RSC render per chapter.
          prefetch={index === currentIndex + 1}
          aria-current={active ? "page" : undefined}
          data-status={displayStatus}
          className={cn(
            "flex items-start gap-2 border-l-2 py-1.5 pl-3 pr-3 text-[13px] leading-snug transition-colors",
            grouped && "pl-4",
            active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60",
          )}
        >
          <span className="mt-[3px] flex shrink-0 items-center gap-1">
            <LinkPending className="text-primary" />
            <StatusIcon className={cn("size-3.5", meta.className)} aria-hidden />
          </span>
          <span className="w-4 shrink-0 text-right font-mono text-[11px] leading-5 text-muted-foreground" aria-hidden>
            {index + 1}
          </span>
          <span className="sr-only">
            第 {index + 1} 章，{meta.label}：
          </span>
          <span className={cn("min-w-0 flex-1 break-words", active ? "font-medium text-primary" : "text-foreground")}>
            {lesson.title}
            {!lesson.required && (
              <span className="ml-1.5 rounded bg-muted px-1 py-0.5 align-middle text-[10px] text-muted-foreground">选做</span>
            )}
          </span>
        </Link>
        {active && <LessonOutline headings={outline} />}
      </li>
    );
  };

  return (
    <nav aria-label="课程章节" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 pb-3 pt-3.5">
        <Link
          href="/courses"
          className="text-[11px] tracking-[0.08em] text-muted-foreground hover:text-foreground"
        >
          ← 全部课程
        </Link>
        <h1 className="mt-1.5 font-serif text-[15px] font-semibold leading-snug">{courseTitle}</h1>
        <div className="mt-2.5 flex items-center gap-2.5">
          <Progress className="flex-1" value={progress.percent} showValue={false} />
          <span data-testid="course-progress-text" className="shrink-0 text-[11px] font-medium tabular-nums">
            {progress.completed} / {progress.total}
            <span className="sr-only"> 必修章节</span>
          </span>
        </div>
      </div>

      <PrefetchOnHover>
        <ol className="py-1.5">
          {groups.map((group, groupIndex) => {
            if (!grouped || !group.unit) {
              return <React.Fragment key={`flat-${groupIndex}`}>{group.lessons.map(renderLesson)}</React.Fragment>;
            }
            const unit = group.unit;
            const open = isOpen(unit);
            const done = group.lessons.filter(({ lesson }) => lessonProgress[lesson.id]?.status === "completed").length;
            const complete = done === group.lessons.length;
            const listId = `nav-unit-${groupIndex}`;
            return (
              <li key={`${unit}-${groupIndex}`} data-unit={unit}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => toggle(unit)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted/50"
                >
                  {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                  <span className="font-semibold tracking-[0.06em] text-foreground">{unit}</span>
                  <span className="ml-auto tabular-nums">
                    {done}/{group.lessons.length}
                  </span>
                  {complete ? (
                    <CheckCircle2 className="size-3.5 text-success" aria-label="本单元已完成" />
                  ) : (
                    <span className="size-3.5" aria-hidden />
                  )}
                </button>
                {open && (
                  <ol id={listId} className="pb-1">
                    {group.lessons.map(renderLesson)}
                  </ol>
                )}
              </li>
            );
          })}
        </ol>
      </PrefetchOnHover>
    </nav>
  );
}
