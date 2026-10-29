import { sql } from "drizzle-orm";

import { one, rows } from "@/lib/db/query";
import { chapterBlocks } from "@/lib/content/chapters";
import { loadCourse, readBlockQuizFile } from "@/lib/content/loader";
import type { QuizQuestion } from "@/lib/content/manifest";
import type {
  ChapterBlockKind,
  CourseAnalytics,
  CourseAnalyticsBlock,
  CourseAnalyticsQuestion,
  EnrollmentStatus,
} from "@/lib/types";

/** Waiting learners count as idle after this many days without interaction. */
export const ANALYTICS_IDLE_DAYS = 7;
const QUESTION_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

type BlockConfig = { id: string; kind: ChapterBlockKind; title?: string };

export type AnalyticsInput = {
  course: { id: string; slug: string; title: string };
  lessons: {
    id: string;
    slug: string;
    title: string;
    position: number;
    required: boolean;
    config: Record<string, unknown> | null;
  }[];
  enrollments: {
    id: string;
    status: EnrollmentStatus;
    started_at: string;
    last_interaction_at: string | null;
  }[];
  progress: { enrollment_id: string; lesson_id: string; status: string }[];
  /** One row per (block, enrollment) that has at least one attempt. */
  blockLearners: {
    lesson_id: string;
    block_id: string;
    attempts: number;
    attempts_to_pass: number;
    passed: boolean;
  }[];
  /** Per-question answer counts grouped by correctness and recorded wrong choice. */
  answers: {
    lesson_id: string;
    block_id: string;
    question_id: string;
    correct: boolean;
    given: string | null;
    count: number;
  }[];
  /** Question banks keyed by `${lessonSlug}::${blockId}`; missing banks fall back to ids. */
  banks: Map<string, QuizQuestion[]>;
  now: Date;
};

function configBlocks(config: Record<string, unknown> | null): BlockConfig[] {
  const blocks = config?.blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.filter(
    (block): block is BlockConfig =>
      typeof block === "object" &&
      block !== null &&
      typeof (block as BlockConfig).id === "string" &&
      ((block as BlockConfig).kind === "simulation" || (block as BlockConfig).kind === "question"),
  );
}

function choiceLabel(question: QuizQuestion | undefined, given: string): string {
  const ids = given.split(",");
  if (!question) return ids.join("、");
  if (question.type === "boolean") {
    return ids.map((id) => (id === "true" ? "正确" : id === "false" ? "错误" : id)).join("、");
  }
  const labels = new Map(question.options.map((option) => [option.id, option.label]));
  return ids.map((id) => labels.get(id) ?? id).join("、");
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function buildCourseAnalytics(input: AnalyticsInput): CourseAnalytics {
  const lessons = input.lessons.slice().sort((a, b) => a.position - b.position);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  const learners = { total: input.enrollments.length, active: 0, completed: 0, abandoned: 0 };
  for (const enrollment of input.enrollments) learners[enrollment.status] += 1;

  const reached = new Map<string, number>();
  const completed = new Map<string, number>();
  const doneByEnrollment = new Map<string, Set<string>>();
  for (const row of input.progress) {
    if (row.status === "not_started") continue;
    reached.set(row.lesson_id, (reached.get(row.lesson_id) ?? 0) + 1);
    if (row.status !== "completed") continue;
    completed.set(row.lesson_id, (completed.get(row.lesson_id) ?? 0) + 1);
    const done = doneByEnrollment.get(row.enrollment_id) ?? new Set<string>();
    done.add(row.lesson_id);
    doneByEnrollment.set(row.enrollment_id, done);
  }

  const waiting = new Map<string, number>();
  const idle = new Map<string, number>();
  const idleBefore = input.now.getTime() - ANALYTICS_IDLE_DAYS * DAY_MS;
  const required = lessons.filter((lesson) => lesson.required);
  for (const enrollment of input.enrollments) {
    if (enrollment.status !== "active") continue;
    const done = doneByEnrollment.get(enrollment.id);
    const next = required.find((lesson) => !done?.has(lesson.id));
    if (!next) continue;
    waiting.set(next.id, (waiting.get(next.id) ?? 0) + 1);
    const lastActive = Date.parse(enrollment.last_interaction_at ?? enrollment.started_at);
    if (lastActive < idleBefore) idle.set(next.id, (idle.get(next.id) ?? 0) + 1);
  }

  type BlockTotals = { learners: number; passed: number; attempts: number; toPass: number; firstTry: number };
  const blockTotals = new Map<string, BlockTotals>();
  for (const row of input.blockLearners) {
    const key = `${row.lesson_id}::${row.block_id}`;
    const totals = blockTotals.get(key) ?? { learners: 0, passed: 0, attempts: 0, toPass: 0, firstTry: 0 };
    totals.learners += 1;
    totals.attempts += row.attempts;
    if (row.passed) {
      totals.passed += 1;
      totals.toPass += row.attempts_to_pass;
      if (row.attempts_to_pass === 1) totals.firstTry += 1;
    }
    blockTotals.set(key, totals);
  }

  const blocks: CourseAnalyticsBlock[] = [];
  const blockTitles = new Map<string, string>();
  for (const lesson of lessons) {
    for (const block of configBlocks(lesson.config)) {
      const key = `${lesson.id}::${block.id}`;
      const title = block.title?.trim() || block.id;
      blockTitles.set(key, title);
      const totals = blockTotals.get(key) ?? { learners: 0, passed: 0, attempts: 0, toPass: 0, firstTry: 0 };
      blocks.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        blockId: block.id,
        title,
        kind: block.kind,
        learners: totals.learners,
        passed: totals.passed,
        stuck: totals.learners - totals.passed,
        attempts: totals.attempts,
        avgAttemptsToPass:
          totals.passed === 0 ? null : Math.round((totals.toPass / totals.passed) * 10) / 10,
        firstTryRate: totals.learners === 0 ? null : rate(totals.firstTry, totals.learners),
      });
    }
  }

  type QuestionTotals = {
    lessonId: string;
    blockId: string;
    questionId: string;
    answered: number;
    wrong: number;
    unrecorded: number;
    choices: Map<string, number>;
  };
  const questionTotals = new Map<string, QuestionTotals>();
  for (const row of input.answers) {
    const key = `${row.lesson_id}::${row.block_id}::${row.question_id}`;
    const totals = questionTotals.get(key) ?? {
      lessonId: row.lesson_id,
      blockId: row.block_id,
      questionId: row.question_id,
      answered: 0,
      wrong: 0,
      unrecorded: 0,
      choices: new Map<string, number>(),
    };
    totals.answered += row.count;
    if (!row.correct) {
      totals.wrong += row.count;
      if (row.given) totals.choices.set(row.given, (totals.choices.get(row.given) ?? 0) + row.count);
      else totals.unrecorded += row.count;
    }
    questionTotals.set(key, totals);
  }

  const questions: CourseAnalyticsQuestion[] = [];
  for (const totals of questionTotals.values()) {
    if (totals.wrong === 0) continue;
    const lesson = lessonById.get(totals.lessonId);
    if (!lesson) continue;
    const bank = input.banks.get(`${lesson.slug}::${totals.blockId}`);
    const question = bank?.find((item) => item.id === totals.questionId);
    questions.push({
      lessonTitle: lesson.title,
      blockTitle: blockTitles.get(`${lesson.id}::${totals.blockId}`) ?? totals.blockId,
      questionId: totals.questionId,
      prompt: question?.prompt ?? totals.questionId,
      answered: totals.answered,
      wrong: totals.wrong,
      wrongRate: rate(totals.wrong, totals.answered),
      wrongChoices: [...totals.choices.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([given, count]) => ({ label: choiceLabel(question, given), count })),
      unrecordedWrong: totals.unrecorded,
    });
  }
  questions.sort((a, b) => b.wrong - a.wrong || b.wrongRate - a.wrongRate);

  return {
    course: input.course,
    learners,
    idleDays: ANALYTICS_IDLE_DAYS,
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      required: lesson.required,
      reached: reached.get(lesson.id) ?? 0,
      completed: completed.get(lesson.id) ?? 0,
      waiting: waiting.get(lesson.id) ?? 0,
      idle: idle.get(lesson.id) ?? 0,
    })),
    blocks,
    questions: questions.slice(0, QUESTION_LIMIT),
  };
}

function loadQuestionBanks(slug: string): Map<string, QuizQuestion[]> {
  const banks = new Map<string, QuizQuestion[]>();
  try {
    const loaded = loadCourse(slug);
    for (const lesson of loaded.manifest.lessons) {
      for (const block of chapterBlocks(lesson)) {
        if (block.kind !== "question") continue;
        banks.set(`${lesson.slug}::${block.id}`, readBlockQuizFile(loaded, lesson, block).questions);
      }
    }
  } catch {
    // Course files are missing or invalid; questions are shown by id instead.
  }
  return banks;
}

/** Aggregated, anonymous learning-difficulty view for one course (admin only). */
export async function getCourseAnalytics(courseId: string): Promise<CourseAnalytics | null> {
  const course = await one<{ id: string; slug: string; title: string }>(sql`
    select id, slug, title from public.courses where id = ${courseId}::uuid limit 1
  `);
  if (!course) return null;

  const [lessons, enrollments, progress, blockLearners, answers] = await Promise.all([
    rows<AnalyticsInput["lessons"][number]>(sql`
      select id, slug, title, position, required, config
      from public.lessons where course_id = ${courseId}::uuid
    `),
    rows<AnalyticsInput["enrollments"][number]>(sql`
      select id, status, started_at::text, last_interaction_at::text
      from public.enrollments where course_id = ${courseId}::uuid
    `),
    rows<AnalyticsInput["progress"][number]>(sql`
      select lp.enrollment_id, lp.lesson_id, lp.status
      from public.lesson_progress lp
      join public.enrollments e on e.id = lp.enrollment_id
      where e.course_id = ${courseId}::uuid
    `),
    rows<{
      lesson_id: string;
      block_id: string;
      attempts: number | string;
      attempts_to_pass: number | string;
      passed: boolean;
    }>(sql`
      with attempts as (
        select ba.enrollment_id, ba.lesson_id, ba.block_id, ba.passed, ba.created_at,
               min(ba.created_at) filter (where ba.passed)
                 over (partition by ba.enrollment_id, ba.lesson_id, ba.block_id) as first_pass
        from public.block_attempts ba
        join public.enrollments e on e.id = ba.enrollment_id
        where e.course_id = ${courseId}::uuid
      )
      select lesson_id, block_id,
             count(*) as attempts,
             count(*) filter (where first_pass is not null and created_at <= first_pass)
               as attempts_to_pass,
             bool_or(passed) as passed
      from attempts
      group by lesson_id, block_id, enrollment_id
    `),
    rows<{
      lesson_id: string;
      block_id: string;
      question_id: string;
      correct: boolean;
      given: string | null;
      count: number | string;
    }>(sql`
      select ba.lesson_id, ba.block_id,
             r ->> 'questionId' as question_id,
             coalesce((r ->> 'correct')::boolean, false) as correct,
             case jsonb_typeof(r -> 'given')
               when 'string' then r ->> 'given'
               when 'array' then (
                 select string_agg(value, ',' order by value)
                 from jsonb_array_elements_text(r -> 'given')
               )
             end as given,
             count(*) as count
      from public.block_attempts ba
      join public.enrollments e on e.id = ba.enrollment_id
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(ba.feedback -> 'results') = 'array'
          then ba.feedback -> 'results' else '[]'::jsonb end
      ) as r
      where e.course_id = ${courseId}::uuid
        and ba.block_kind = 'question'
        and r ->> 'questionId' is not null
      group by 1, 2, 3, 4, 5
    `),
  ]);

  return buildCourseAnalytics({
    course,
    lessons,
    enrollments,
    progress,
    blockLearners: blockLearners.map((row) => ({
      ...row,
      attempts: Number(row.attempts),
      attempts_to_pass: Number(row.attempts_to_pass),
    })),
    answers: answers.map((row) => ({ ...row, count: Number(row.count) })),
    banks: loadQuestionBanks(course.slug),
    now: new Date(),
  });
}
