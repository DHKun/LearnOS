import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlaskConical, ListChecks, Lock, FileText } from "lucide-react";

import { CompleteLessonButton, JoinCourseButton } from "@/components/learning/actions";
import { ArticleView } from "@/components/learning/article-view";
import { LearningHeartbeat } from "@/components/learning/heartbeat";
import { ActivityHost } from "@/components/activities/activity-host";
import { LearningWorkspace } from "@/components/learning/workspace";
import { LessonPager } from "@/components/learning/lesson-pager";
import { LearningProvider } from "@/lib/learning/context";
import { LessonNav } from "@/components/learning/lesson-nav";
import { NotesPanel } from "@/components/learning/notes-panel";
import { QuizPlayer } from "@/components/learning/quiz-player";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStudent } from "@/lib/auth/session";
import { loadCourse, readArticleSource } from "@/lib/content/loader";
import { extractHeadings, type LessonHeading } from "@/lib/content/headings";
import { getCourseDetailById } from "@/lib/services/courses";
import { getStateForEnrollment } from "@/lib/services/learning";
import { getQuizData } from "@/lib/services/quizzes";
import { getNote } from "@/lib/services/notes";
import type { LessonSummary } from "@/lib/types";

export const metadata: Metadata = { title: "学习" };

const TYPE_LABEL = {
  article: "图文精读",
  interactive: "互动实验",
  quiz: "最终测验",
} as const;

const TYPE_ICON = {
  article: FileText,
  interactive: FlaskConical,
  quiz: ListChecks,
} as const;

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
  const TypeIcon = TYPE_ICON[current.type];

  let articleSource: string | null = null;
  let outline: LessonHeading[] = [];
  let initialLabState: Awaited<ReturnType<typeof getStateForEnrollment>> | null = null;
  let initialQuiz: Awaited<ReturnType<typeof getQuizData>> | null = null;
  if (!abandoned && (current.type === "interactive" || current.type === "article")) {
    initialLabState = await getStateForEnrollment(enrollment.id, current.id);
  }
  if (!abandoned && current.type === "quiz") {
    initialQuiz = await getQuizData(current.id);
  }
  const initialNote = abandoned ? undefined : await getNote(student.id, current.id);
  if (!abandoned && current.type === "article") {
    const loaded = loadCourse(course.slug);
    const manifestLesson = loaded.manifest.lessons.find((lesson) => lesson.slug === current.slug);
    if (manifestLesson && manifestLesson.type === "article") {
      articleSource = readArticleSource(loaded, manifestLesson);
      outline = extractHeadings(articleSource);
    }
  }

  const completionHint = readOnly
    ? "课程已完成，当前章节仅供复习。"
    : current.type === "article"
      ? completedCurrent
        ? "本章已完成。可继续下一节，或重新阅读。"
        : "阅读本节内容，必要时完成概念动画与知识检查，然后标记本章完成。"
      : current.type === "interactive"
        ? completedCurrent
          ? "实验已通过服务端验证。可继续探索不同参数。"
          : "完成互动模拟并提交结论；通过服务端验证后本章完成。"
        : completedCurrent
          ? "最终测验已通过。"
          : "完成最终测验并达到及格线，课程方可结课。";

  return (
    <LearningWorkspace
      lessonLabel={`${course.title} · 第 ${current.position + 1} / ${lessons.length} 章`}
      nav={
        <LessonNav
          courseId={course.id}
          courseTitle={course.title}
          lessons={lessons}
          currentLessonId={current.id}
          progress={enrollment.progress}
          lessonProgress={myLessonProgress}
          outline={outline}
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
            lessons={lessons}
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
                <Badge variant="secondary" className="gap-1">
                  <TypeIcon className="size-3" />
                  {TYPE_LABEL[current.type]}
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

            {current.type === "article" && articleSource && (
              <LearningProvider
                activityId="article"
                lessonId={current.id}
                enrollmentId={enrollment.id}
                initialState={initialLabState?.state ?? null}
                initialVersion={initialLabState?.version ?? 0}
                readOnly={readOnly}
              >
                <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
                  <ArticleView source={articleSource} />
                </div>
              </LearningProvider>
            )}

            {current.type === "article" && (
              <div className="flex flex-col gap-2 border-t border-border pt-5">
                {readOnly ? (
                  <p className="text-sm text-muted-foreground">复习模式不记录新的完成状态。</p>
                ) : completedCurrent ? (
                  <p className="text-sm text-success">本章已完成，可继续下一节。</p>
                ) : (
                  <CompleteLessonButton
                    key={current.id}
                    lessonId={current.id}
                    enrollmentId={enrollment.id}
                    completed={completedCurrent}
                  />
                )}
              </div>
            )}

            {current.type === "interactive" && current.activityId && (
              <ActivityHost
                activityId={current.activityId}
                lessonId={current.id}
                enrollmentId={enrollment.id}
                initialState={initialLabState?.state ?? null}
                initialVersion={initialLabState?.version ?? 0}
                readOnly={readOnly}
              />
            )}

            {current.type === "interactive" && !current.activityId && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                实验组件未配置，请联系管理员重新同步课程。
              </p>
            )}

            {current.type === "quiz" && (
              <QuizPlayer
                lessonId={current.id}
                enrollmentId={enrollment.id}
                readOnly={readOnly}
                alreadyCompleted={completedCurrent}
                initialQuiz={initialQuiz!}
              />
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
