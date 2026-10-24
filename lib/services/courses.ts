import { sql } from "drizzle-orm";

import { one, rows, uuidList } from "@/lib/db/query";
import type {
  AdminCourseDetail,
  ChapterBlockSummary,
  AdminCourseRow,
  CourseDetail,
  CourseListItem,
  CurrentEnrollment,
  HistoryItem,
  LessonProgressStatus,
  LessonSummary,
  MyLessonProgress,
} from "@/lib/types";
import {
  computeProgress,
  progressByEnrollment,
  type EnrollmentRow,
  type LessonRow,
  mapEnrollment,
} from "@/lib/services/shared";

type CourseWithLessons = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  content_version: string;
  lessons?: LessonRow[];
};

type ProgressRow = { lesson_id: string; status: string; completed_at: string | null };

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const COURSE_CACHE_TTL_MS = 15_000;
const courseCache = new Map<string, { at: number; row: CourseWithLessons }>();

function readCachedCourse(key: string): CourseWithLessons | null {
  if (!IS_PRODUCTION) return null;
  const hit = courseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > COURSE_CACHE_TTL_MS) {
    courseCache.delete(key);
    return null;
  }
  return hit.row;
}

function writeCachedCourse(key: string, row: CourseWithLessons): CourseWithLessons {
  if (IS_PRODUCTION) courseCache.set(key, { at: Date.now(), row });
  return row;
}

export function invalidateCourseCache(): void {
  courseCache.clear();
}

function chapterBlocks(config: Record<string, unknown>): ChapterBlockSummary[] | undefined {
  if (!Array.isArray(config.blocks)) return undefined;
  const blocks: ChapterBlockSummary[] = [];
  for (const raw of config.blocks) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    if (typeof block.id !== "string") continue;
    if (block.kind !== "simulation" && block.kind !== "question") continue;
    blocks.push({
      id: block.id,
      kind: block.kind,
      ...(typeof block.activityId === "string" ? { activityId: block.activityId } : {}),
      ...(typeof block.title === "string" ? { title: block.title } : {}),
      ...(typeof block.passScore === "number" ? { passScore: block.passScore } : {}),
      ...(typeof block.questionCount === "number" ? { questionCount: block.questionCount } : {}),
    });
  }
  return blocks.length > 0 ? blocks : undefined;
}

function toLessonSummary(row: LessonRow): LessonSummary {
  const config = row.config ?? {};
  const completion =
    config.completion && typeof config.completion === "object"
      ? (config.completion as { mode?: string; requiredBlocks?: unknown })
      : null;
  const blocks = chapterBlocks(config);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    position: row.position,
    required: row.required,
    completionPolicy: row.completion_policy,
    ...(typeof config.unit === "string" ? { unit: config.unit } : {}),
    ...(row.type === "interactive" && typeof config.activityId === "string"
      ? { activityId: config.activityId }
      : {}),
    ...(blocks ? { blocks } : {}),
    ...(completion &&
    (completion.mode === "manual" || completion.mode === "all" || completion.mode === "any") &&
    Array.isArray(completion.requiredBlocks)
      ? {
          completion: {
            mode: completion.mode,
            requiredBlocks: completion.requiredBlocks.filter(
              (id): id is string => typeof id === "string",
            ),
          },
        }
      : {}),
  };
}

function toProgressMap(lessons: { id: string }[], progressRows: ProgressRow[]): MyLessonProgress {
  const map: MyLessonProgress = {};
  const byLesson = new Map(progressRows.map((row) => [row.lesson_id, row]));
  for (const lesson of lessons) {
    const row = byLesson.get(lesson.id);
    map[lesson.id] = {
      status: (row?.status as MyLessonProgress[string]["status"]) ?? "not_started",
      completedAt: row?.completed_at ?? null,
    };
  }
  return map;
}

async function fetchCourseBySlug(slug: string): Promise<CourseWithLessons | null> {
  const course = await one<Omit<CourseWithLessons, "lessons">>(sql`
    select id, slug, title, description, status, content_version
    from public.courses
    where slug = ${slug}
    limit 1
  `);
  if (!course) return null;
  const lessons = await rows<LessonRow>(sql`
    select id, course_id, slug, title, type, position, required, completion_policy, config
    from public.lessons
    where course_id = ${course.id}::uuid
  `);
  return { ...course, lessons };
}

async function fetchCourseById(id: string): Promise<CourseWithLessons | null> {
  const course = await one<Omit<CourseWithLessons, "lessons">>(sql`
    select id, slug, title, description, status, content_version
    from public.courses
    where id = ${id}::uuid
    limit 1
  `);
  if (!course) return null;
  const lessons = await rows<LessonRow>(sql`
    select id, course_id, slug, title, type, position, required, completion_policy, config
    from public.lessons
    where course_id = ${id}::uuid
  `);
  return { ...course, lessons };
}

async function fetchEnrollmentWithProgress(
  courseId: string,
  studentId: string,
): Promise<(EnrollmentRow & { lesson_progress: ProgressRow[] }) | null> {
  const enrollment = await one<EnrollmentRow>(sql`
    select id, student_id, course_id, status, current_lesson_id,
           started_at::text, last_seen_at::text, last_interaction_at::text, completed_at::text
    from public.enrollments
    where course_id = ${courseId}::uuid and student_id = ${studentId}::uuid
    limit 1
  `);
  if (!enrollment) return null;
  const progress = await rows<ProgressRow>(sql`
    select lesson_id, status, completed_at::text
    from public.lesson_progress
    where enrollment_id = ${enrollment.id}::uuid
  `);
  return { ...enrollment, lesson_progress: progress };
}

function assembleCourseDetail(
  course: CourseWithLessons,
  enrollmentRow: (EnrollmentRow & { lesson_progress: ProgressRow[] }) | null,
): CourseDetail | null {
  const lessons = (course.lessons ?? []).slice().sort((a, b) => a.position - b.position);
  if (course.status !== "published" && !enrollmentRow) return null;
  const progressRows = enrollmentRow?.lesson_progress ?? [];
  const completed = new Set(
    progressRows.filter((row) => row.status === "completed").map((row) => row.lesson_id),
  );
  const progress = computeProgress(
    lessons.filter((lesson) => lesson.required).map((lesson) => lesson.id),
    completed,
  );
  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
      contentVersion: course.content_version,
    },
    lessons: lessons.map(toLessonSummary),
    myEnrollment: enrollmentRow ? mapEnrollment(enrollmentRow, progress) : null,
    myLessonProgress: toProgressMap(lessons, progressRows),
  };
}

export async function listStudentCourses(studentId: string): Promise<CourseListItem[]> {
  const courses = await rows<CourseWithLessons>(sql`
    select id, slug, title, description, status, content_version
    from public.courses
    where status = 'published'
    order by created_at asc
  `);
  if (!courses.length) return [];

  const courseIds = courses.map((course) => course.id);
  const [lessons, enrollments, progress] = await Promise.all([
    rows<LessonRow>(sql`
      select id, course_id, slug, title, type, position, required, completion_policy, config
      from public.lessons
      where course_id = any(${uuidList(courseIds)})
    `),
    rows<EnrollmentRow>(sql`
      select id, student_id, course_id, status, current_lesson_id,
             started_at::text, last_seen_at::text, last_interaction_at::text, completed_at::text
      from public.enrollments
      where student_id = ${studentId}::uuid
        and course_id = any(${uuidList(courseIds)})
    `),
    rows<{ enrollment_id: string; lesson_id: string; status: LessonProgressStatus }>(sql`
      select enrollment_id, lesson_id, status
      from public.lesson_progress
      where enrollment_id in (
        select id from public.enrollments
        where student_id = ${studentId}::uuid
          and course_id = any(${uuidList(courseIds)})
      )
    `),
  ]);

  const progressMap = progressByEnrollment(enrollments, lessons, progress);
  const enrollmentByCourse = new Map(enrollments.map((row) => [row.course_id, row]));
  const lessonCountByCourse = new Map<string, number>();
  for (const lesson of lessons) {
    lessonCountByCourse.set(lesson.course_id, (lessonCountByCourse.get(lesson.course_id) ?? 0) + 1);
  }

  return courses.map((course) => {
    const enrollment = enrollmentByCourse.get(course.id);
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      lessonCount: lessonCountByCourse.get(course.id) ?? 0,
      status: course.status,
      myStatus: enrollment?.status ?? null,
      myProgress: enrollment ? progressMap.get(enrollment.id) ?? null : null,
    };
  });
}

export async function getCourseDetailBySlug(
  slug: string,
  studentId: string,
): Promise<CourseDetail | null> {
  const cacheKey = `slug:${slug}`;
  let course = readCachedCourse(cacheKey);
  if (!course) {
    course = await fetchCourseBySlug(slug);
    if (!course) return null;
    writeCachedCourse(cacheKey, course);
  }
  const enrollment = await fetchEnrollmentWithProgress(course.id, studentId);
  return assembleCourseDetail(course, enrollment);
}

export async function getCurrentEnrollment(studentId: string): Promise<CurrentEnrollment | null> {
  const enrollmentRow = await one<EnrollmentRow>(sql`
    select id, student_id, course_id, status, current_lesson_id,
           started_at::text, last_seen_at::text, last_interaction_at::text, completed_at::text
    from public.enrollments
    where student_id = ${studentId}::uuid and status = 'active'
    limit 1
  `);
  if (!enrollmentRow) return null;

  const course = await fetchCourseById(enrollmentRow.course_id);
  if (!course) return null;
  const progressRows = await rows<ProgressRow>(sql`
    select lesson_id, status, completed_at::text
    from public.lesson_progress
    where enrollment_id = ${enrollmentRow.id}::uuid
  `);
  const lessons = (course.lessons ?? []).slice().sort((a, b) => a.position - b.position);
  const completed = new Set(
    progressRows.filter((row) => row.status === "completed").map((row) => row.lesson_id),
  );
  const progress = computeProgress(
    lessons.filter((lesson) => lesson.required).map((lesson) => lesson.id),
    completed,
  );

  return {
    enrollment: mapEnrollment(enrollmentRow, progress),
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
    },
    lessons: lessons.map(toLessonSummary),
    lessonProgress: toProgressMap(lessons, progressRows),
    courseProgress: progress,
  };
}

export async function getEnrollmentHistory(studentId: string): Promise<HistoryItem[]> {
  const enrollments = await rows<EnrollmentRow>(sql`
    select id, student_id, course_id, status, current_lesson_id,
           started_at::text, last_seen_at::text, last_interaction_at::text, completed_at::text
    from public.enrollments
    where student_id = ${studentId}::uuid
    order by started_at desc
  `);
  if (!enrollments.length) return [];

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const enrollmentIds = enrollments.map((row) => row.id);
  const [courses, lessons, progress] = await Promise.all([
    rows<{ id: string; slug: string; title: string }>(sql`
      select id, slug, title from public.courses where id = any(${uuidList(courseIds)})
    `),
    rows<LessonRow>(sql`
      select id, course_id, slug, title, type, position, required, completion_policy, config
      from public.lessons where course_id = any(${uuidList(courseIds)})
    `),
    rows<{ enrollment_id: string; lesson_id: string; status: LessonProgressStatus }>(sql`
      select enrollment_id, lesson_id, status
      from public.lesson_progress
      where enrollment_id = any(${uuidList(enrollmentIds)})
    `),
  ]);

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const progressMap = progressByEnrollment(enrollments, lessons, progress);

  return enrollments.map((enrollment) => {
    const course = courseById.get(enrollment.course_id);
    return {
      enrollmentId: enrollment.id,
      course: {
        id: course?.id ?? enrollment.course_id,
        slug: course?.slug ?? "",
        title: course?.title ?? "未知课程",
      },
      status: enrollment.status,
      progress: progressMap.get(enrollment.id) ?? { total: 0, completed: 0, percent: 0 },
      startedAt: enrollment.started_at,
      completedAt: enrollment.completed_at,
    };
  });
}

export async function listAdminCourses(): Promise<AdminCourseRow[]> {
  const [courses, lessons, enrollments] = await Promise.all([
    rows<{
      id: string;
      slug: string;
      title: string;
      description: string;
      status: "draft" | "published" | "archived";
      content_version: string;
      created_at: string;
    }>(sql`
      select id, slug, title, description, status, content_version, created_at::text
      from public.courses order by created_at asc
    `),
    rows<{ id: string; course_id: string }>(sql`
      select id, course_id from public.lessons
    `),
    rows<{ id: string; course_id: string; status: string }>(sql`
      select id, course_id, status from public.enrollments
    `),
  ]);

  const lessonCount = new Map<string, number>();
  for (const lesson of lessons) {
    lessonCount.set(lesson.course_id, (lessonCount.get(lesson.course_id) ?? 0) + 1);
  }
  const stats = new Map<string, { total: number; active: number; completed: number }>();
  for (const enrollment of enrollments) {
    const current = stats.get(enrollment.course_id) ?? { total: 0, active: 0, completed: 0 };
    current.total += 1;
    if (enrollment.status === "active") current.active += 1;
    if (enrollment.status === "completed") current.completed += 1;
    stats.set(enrollment.course_id, current);
  }

  return courses.map((course) => {
    const current = stats.get(course.id) ?? { total: 0, active: 0, completed: 0 };
    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
      contentVersion: course.content_version,
      lessonCount: lessonCount.get(course.id) ?? 0,
      enrollmentCount: current.total,
      activeCount: current.active,
      completedCount: current.completed,
    };
  });
}

export async function getAdminCourseDetail(id: string): Promise<AdminCourseDetail | null> {
  const course = await one<{
    id: string;
    slug: string;
    title: string;
    description: string;
    status: "draft" | "published" | "archived";
    content_version: string;
    created_at: string;
    updated_at: string;
  }>(sql`
    select id, slug, title, description, status, content_version,
           created_at::text, updated_at::text
    from public.courses where id = ${id}::uuid limit 1
  `);
  if (!course) return null;

  const [lessons, enrollments] = await Promise.all([
    rows<LessonRow>(sql`
      select id, course_id, slug, title, type, position, required, completion_policy, config
      from public.lessons where course_id = ${id}::uuid
    `),
    rows<{ id: string; status: string }>(sql`
      select id, status from public.enrollments where course_id = ${id}::uuid
    `),
  ]);

  const counts = { active: 0, completed: 0, abandoned: 0 };
  for (const enrollment of enrollments) {
    if (enrollment.status in counts) counts[enrollment.status as keyof typeof counts] += 1;
  }

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
      contentVersion: course.content_version,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
    },
    lessons: lessons
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((lesson) => ({
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        type: lesson.type,
        position: lesson.position,
        required: lesson.required,
        completionPolicy: lesson.completion_policy,
      })),
    counts,
  };
}

export async function getCourseDetailById(
  courseId: string,
  studentId: string,
): Promise<CourseDetail | null> {
  const cacheKey = `id:${courseId}`;
  let course = readCachedCourse(cacheKey);
  if (!course) {
    course = await fetchCourseById(courseId);
    if (!course) return null;
    writeCachedCourse(cacheKey, course);
  }
  const enrollment = await fetchEnrollmentWithProgress(courseId, studentId);
  return assembleCourseDetail(course, enrollment);
}
