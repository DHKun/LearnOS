import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LessonSummary } from "@/lib/types";

export function LessonPager({
  courseId,
  courseSlug,
  lessons,
  currentLessonId,
  courseCompleted,
}: {
  courseId: string;
  courseSlug: string;
  lessons: LessonSummary[];
  currentLessonId: string;
  courseCompleted: boolean;
}) {
  const index = lessons.findIndex((lesson) => lesson.id === currentLessonId);
  const previous = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;

  return (
    <nav className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between" aria-label="章节导航">
      <div>
        {previous ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/learn/${courseId}?lesson=${previous.id}`}>
              <ArrowLeft className="size-4" /> 上一节：{previous.title}
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已经是第一节</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {next ? (
          <Button asChild size="sm">
            <Link href={`/learn/${courseId}?lesson=${next.id}`}>
              下一节：{next.title} <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : courseCompleted ? (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> 课程已完成
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${courseSlug}`}>返回课程</Link>
            </Button>
          </div>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/${courseSlug}`}>返回课程目录</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
