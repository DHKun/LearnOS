import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { JoinCourseButton } from "@/components/learning/actions";
import { ArticleView } from "@/components/learning/article-view";
import { ChapterProgress } from "@/components/learning/chapter-progress";
import { LearningHeartbeat } from "@/components/learning/heartbeat";
import { LearningWorkspace } from "@/components/learning/workspace";
import { LessonPager } from "@/components/learning/lesson-pager";
import { ChapterLearningProvider } from "@/lib/learning/chapter-context";
import { LessonNav } from "@/components/learning/lesson-nav";
import { NotesPanel } from "@/components/learning/notes-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/session";
import { loadCourse, readArticleSource } from "@/lib/content/loader";
import { extractHeadings, type LessonHeading } from "@/lib/content/headings";
import { getCourseDetailById } from "@/lib/services/courses";
import { getBlockResults } from "@/lib/services/blocks";
import { resolveChapterBlocks } from "@/lib/content/blocks";
import { getStateForEnrollment } from "@/lib/services/learning";
import { getNote } from "@/lib/services/notes";
import type { LessonSummary } from "@/lib/types";

export const metadata: Metadata = { title: "学习" };

export default async function LearnPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ lesson?: string }>;
}) {
  const student = await requireStudent();
  const { courseId } = await params;
  const query = await searchParams;

  const detail = await getCourseDetailById(courseId, student.id);
  if (!detail) notFound();

  const enrollment = detail.myEnrollment;
  if (!enrollment) redirect(`/courses/${detail.course.slug}`);

  const { lessons, course, myLessonProgress } = detail;
  if (lessons.length === 0) notFound();

  // The directory and pager only need light lesson metadata. Keeping blocks
  // and completion rules out of their props reduces the RSC payload sent on
  // every chapter navigation.
  const navLessons = lessons.map((lesson) => ({
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    type: lesson.type,
    position: lesson.position,
    required: lesson.required,
    completionPolicy: lesson.completionPolicy,
    ...(lesson.unit ? { unit: lesson.unit } : {}),
  }));

  const requested = query.lesson ? lessons.find((lesson) => lesson.id === query.lesson) : undefined;
  const currentFromEnrollment = enrollment.currentLessonId
    ? lessons.find((lesson) => lesson.id === enrollment.currentLessonId)
    : undefined;
  const firstIncomplete = lessons.find(
    (lesson) => lesson.required && myLessonProgress[lesson.id]?.status !== "completed",
  );
  const current: LessonSummary =
    requested ?? currentFromEnrollment ?? firstIncomplete ?? lessons[0];

  const readOnly = enrollment.status === "completed";
  const abandoned = enrollment.status === "abandoned";
  const completedCurrent = myLessonProgress[current.id]?.status === "completed";
  const currentIndex = lessons.findIndex((lesson) => lesson.id === current.id);
  const nextLesson =
    currentIndex >= 0 && currentIndex < lessons.length - 1 ? lessons[currentIndex + 1] : null;

  let articleSource: string | null = null;
  let outline: LessonHeading[] = [];
  let chapterBlocks: Awaited<ReturnType<typeof resolveChapterBlocks>>["blocks"] = [];
  let chapterCompletion: Awaited<ReturnType<typeof resolveChapterBlocks>>["completion"] = {
    mode: "manual",
    requiredBlocks: [],
  };
  let blockResults: Awaited<ReturnType<typeof getBlockResults>> = {};
  let initialState: Awaited<ReturnType<typeof getStateForEnrollment>> | null = null;
  let initialNote: Awaited<ReturnType<typeof getNote>> | undefined;

  if (!abandoned) {
    // Manifest/MDX parsing is synchronous and cached in production; run the
    // three independent database reads concurrently instead of serially.
    const loaded = loadCourse(course.slug);
    const manifestLesson = loaded.manifest.lessons.find((lesson) => lesson.slug === current.slug);
    if (!manifestLesson) notFound();
    articleSource = readArticleSource(loaded, manifestLesson);
    outline = extractHeadings(articleSource);
    const resolved = resolveChapterBlocks(loaded, manifestLesson);
    chapterBlocks = resolved.blocks;
    chapterCompletion = resolved.completion;

    const [stateResult, resultsResult, noteResult] = await Promise.all([
      getStateForEnrollment(enrollment.id, current.id),
      chapterBlocks.length > 0
        ? getBlockResults(enrollment.id, current.id)
        : Promise.resolve({}),
      getNote(student.id, current.id),
    ]);
    initialState = stateResult;
    blockResults = resultsResult;
    initialNote = noteResult;
  }

  const hasRequiredBlocks = chapterCompletion.mode !== "manual";
  const completionHint = readOnly
    ? "课程已完成，当前章节仅供复习。"
    : completedCurrent
      ? "本章已完成。可继续下一节，或重新阅读。"
      : hasRequiredBlocks
        ? "阅读、动画和模拟可以任意穿插；完成本章要求的实验或知识检查后，服务端会自动完成本章。"
        : chapterBlocks.length > 0
          ? "阅读本章内容并按需体验互动；本章为手动完成。"
          : "阅读本节内容，然后标记本章完成。";

  return (
    <LearningWorkspace
      lessonLabel={`${course.title} · 第 ${current.position + 1} / ${lessons.length} 章`}
      outline={outline}
      nav={
        <LessonNav
          courseId={course.id}
          courseTitle={course.title}
          lessons={navLessons}
          currentLessonId={current.id}
          progress={enrollment.progress}
          lessonProgress={myLessonProgress}
        />
      }
      notes={
        <NotesPanel
          key={current.id}
          lessonId={current.id}
          lessonTitle={current.title}
          initialNote={initialNote}
          studentId={student.id}
        />
      }
      pager={
        abandoned ? null : (
          <LessonPager
            courseId={course.id}
            courseSlug={course.slug}
            lessons={navLessons}
            currentLessonId={current.id}
            courseCompleted={enrollment.status === "completed"}
          />
        )
      }
      content={
        <div className="space-y-6">
          {abandoned ? (
            <Card>
              <CardHeader>
                <CardTitle>课程已退出</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  章节进度、实验状态与笔记均已保留；恢复学习后从原进度继续。
                </p>
                <JoinCourseButton courseId={course.id} label="恢复学习" />
              </CardContent>
            </Card>
          ) : (
            <>
              {readOnly && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
                  <Lock className="size-4" />
                  课程已完成，当前为只读复习模式，不记录进度或发放积分。
                </div>
              )}

              <header className="border-b border-border pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {chapterBlocks.length > 0 ? "混合章节" : "章节"}
                  </Badge>
                  {current.required ? (
                    <Badge variant="outline">必修</Badge>
                  ) : (
                    <Badge variant="outline">选做</Badge>
                  )}
                  {completedCurrent && <Badge variant="success">已完成</Badge>}
                  <span className="text-xs text-muted-foreground">
                    第 {current.position + 1} / {lessons.length} 章
                  </span>
                </div>
                <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight">
                  {current.title}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {completionHint}
                </p>
              </header>

              {articleSource && (
                <ChapterLearningProvider
                  key={current.id}
                  lessonId={current.id}
                  enrollmentId={enrollment.id}
                  initialState={initialState?.state ?? null}
                  initialVersion={initialState?.version ?? 0}
                  readOnly={readOnly}
                  blocks={chapterBlocks}
                  completion={chapterCompletion}
                  blockResults={blockResults}
                  completed={completedCurrent}
                >
                  <div className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-8">
                    <ArticleView source={articleSource} />
                  </div>
                  <ChapterProgress
                    lessonId={current.id}
                    enrollmentId={enrollment.id}
                    completion={chapterCompletion}
                    blocks={chapterBlocks}
                    blockResults={blockResults}
                    completed={completedCurrent}
                    readOnly={readOnly}
                    courseId={course.id}
                    nextLesson={nextLesson}
                  />
                </ChapterLearningProvider>
              )}

              {!readOnly && (
                <LearningHeartbeat enrollmentId={enrollment.id} lessonId={current.id} />
              )}

              <div className="border-t border-border pt-4 text-xs text-muted-foreground">
                <Link href={`/courses/${course.slug}`} className="hover:text-foreground">
                  查看课程详情
                </Link>
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
