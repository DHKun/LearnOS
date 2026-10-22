import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdminCourseDetail,
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

const LESSON_COLUMNS =
  "id,course_id,slug,title,type,position,required,completion_policy,config";
const ENROLLMENT_COLUMNS =
  "id,student_id,course_id,status,current_lesson_id,started_at,last_seen_at,last_interaction_at,completed_at";

function toLessonSummary(row: LessonRow): LessonSummary {
  const config = row.config ?? {};
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    position: row.position,
    required: row.required,
    completionPolicy: row.completion_policy,
    ...(row.type === "interactive" && typeof config.activityId === "string"
      ? { activityId: config.activityId }
      : {}),
  };
}

function toProgressMap(
  lessons: { id: string }[],
  rows: { lesson_id: string; status: string; completed_at: string | null }[],
): MyLessonProgress {
  const map: MyLessonProgress = {};
  const byLesson = new Map(rows.map((row) => [row.lesson_id, row]));
  for (const lesson of lessons) {
    const row = byLesson.get(lesson.id);
    map[lesson.id] = {
      status: (row?.status as MyLessonProgress[string]["status"]) ?? "not_started",
      completedAt: row?.completed_at ?? null,
    };
  }
  return map;
}

export async function listStudentCourses(studentId: string): Promise<CourseListItem[]> {
  const db = createAdminClient();
  const { data: courses, error } = await db
    .from("courses")
    .select("id,slug,title,description,status,created_at,lessons(id,course_id,required)")
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!courses?.length) return [];

  const courseIds = courses.map((course) => course.id);

  const enrollmentsResult = await db
    .from("enrollments")
    .select(`${ENROLLMENT_COLUMNS},lesson_progress(lesson_id,status)`)
    .eq("student_id", studentId)
    .in("course_id", courseIds);

  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const lessons = courses.flatMap((course) =>
    (course.lessons ?? []).map((lesson) => ({
      ...lesson,
      required: lesson.required,
      course_id: lesson.course_id,
      id: lesson.id,
    })),
  ) as unknown as LessonRow[];
  const enrollmentRows = (enrollmentsResult.data ?? []) as unknown as (EnrollmentRow & {
    lesson_progress?: { lesson_id: string; status: string }[];
  })[];
  const enrollments = enrollmentRows as EnrollmentRow[];
  const progressRows = enrollmentRows.flatMap((enrollment) =>
    (enrollment.lesson_progress ?? []).map((progress) => ({
      enrollment_id: enrollment.id,
      lesson_id: progress.lesson_id,
      status: progress.status as LessonProgressStatus,
    })),
  );

  const progressMap = progressByEnrollment(enrollments, lessons, progressRows);
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
  const db = createAdminClient();
  const { data: course, error } = await db
    .from("courses")
    .select(
      `id,slug,title,description,status,content_version,lessons(${LESSON_COLUMNS})`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!course) return null;

  const enrollmentResult = await db
    .from("enrollments")
    .select(`${ENROLLMENT_COLUMNS},lesson_progress(lesson_id,status,completed_at)`)
    .eq("course_id", course.id)
    .eq("student_id", studentId)
    .maybeSingle();

  if (enrollmentResult.error) throw enrollmentResult.error;

  const lessons = (
    ((course as unknown as { lessons?: LessonRow[] }).lessons ?? []) as LessonRow[]
  )
    .slice()
    .sort((a, b) => a.position - b.position);
  const enrollmentRow = enrollmentResult.data as unknown as
    | (EnrollmentRow & {
        lesson_progress?: { lesson_id: string; status: string; completed_at: string | null }[];
      })
    | null;
  const enrollment = enrollmentRow as EnrollmentRow | null;

  if (course.status !== "published" && !enrollment) return null;

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
    myEnrollment: enrollment ? mapEnrollment(enrollment, progress) : null,
    myLessonProgress: toProgressMap(lessons, progressRows),
  };
}

export async function getCurrentEnrollment(studentId: string): Promise<CurrentEnrollment | null> {
  const db = createAdminClient();
  const { data: enrollmentRow, error } = await db
    .from("enrollments")
    .select(
      `${ENROLLMENT_COLUMNS},lesson_progress(lesson_id,status,completed_at),courses(id,slug,title,description,status,lessons(${LESSON_COLUMNS}))`,
    )
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!enrollmentRow) return null;

  const nestedCourse = enrollmentRow.courses;
  const course = Array.isArray(nestedCourse) ? nestedCourse[0] : nestedCourse;
  if (!course) return null;

  const enrollment = enrollmentRow as unknown as EnrollmentRow;

  const nestedLessons = (course as unknown as { lessons?: LessonRow[] }).lessons ?? [];
  const lessons = nestedLessons.slice().sort((a, b) => a.position - b.position);
  const progressRows =
    (enrollmentRow as unknown as {
      lesson_progress?: { lesson_id: string; status: string; completed_at: string | null }[];
    }).lesson_progress ?? [];
  const completed = new Set(
    progressRows.filter((row) => row.status === "completed").map((row) => row.lesson_id),
  );
  const progress = computeProgress(
    lessons.filter((lesson) => lesson.required).map((lesson) => lesson.id),
    completed,
  );

  return {
    enrollment: mapEnrollment(enrollment as EnrollmentRow, progress),
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
  const db = createAdminClient();
  const { data: enrollments, error } = await db
    .from("enrollments")
    .select(ENROLLMENT_COLUMNS)
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });

  if (error) throw error;
  if (!enrollments?.length) return [];

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const [coursesResult, lessonsResult, progressResult] = await Promise.all([
    db.from("courses").select("id,slug,title").in("id", courseIds),
    db.from("lessons").select("id,course_id,required").in("course_id", courseIds),
    db
      .from("lesson_progress")
      .select("enrollment_id,lesson_id,status")
      .in(
        "enrollment_id",
        enrollments.map((row) => row.id),
      ),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (lessonsResult.error) throw lessonsResult.error;
  if (progressResult.error) throw progressResult.error;

  const courseById = new Map((coursesResult.data ?? []).map((course) => [course.id, course]));
  const progressMap = progressByEnrollment(
    enrollments as EnrollmentRow[],
    (lessonsResult.data ?? []) as LessonRow[],
    progressResult.data ?? [],
  );

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
  const db = createAdminClient();
  const [coursesResult, lessonsResult, enrollmentsResult] = await Promise.all([
    db
      .from("courses")
      .select("id,slug,title,description,status,content_version,created_at")
      .order("created_at", { ascending: true }),
    db.from("lessons").select("id,course_id"),
    db.from("enrollments").select("id,course_id,status"),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (lessonsResult.error) throw lessonsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const lessonCount = new Map<string, number>();
  for (const lesson of lessonsResult.data ?? []) {
    lessonCount.set(lesson.course_id, (lessonCount.get(lesson.course_id) ?? 0) + 1);
  }

  const stats = new Map<string, { total: number; active: number; completed: number }>();
  for (const enrollment of enrollmentsResult.data ?? []) {
    const current = stats.get(enrollment.course_id) ?? { total: 0, active: 0, completed: 0 };
    current.total += 1;
    if (enrollment.status === "active") current.active += 1;
    if (enrollment.status === "completed") current.completed += 1;
    stats.set(enrollment.course_id, current);
  }

  return (coursesResult.data ?? []).map((course) => {
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
  const db = createAdminClient();
  const { data: course, error } = await db
    .from("courses")
    .select(
      "id,slug,title,description,status,content_version,created_at,updated_at,lessons(id,course_id,slug,title,type,position,required,completion_policy,config)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!course) return null;

  const enrollmentsResult = await db
    .from("enrollments")
    .select("id,status")
    .eq("course_id", id);

  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const counts = { active: 0, completed: 0, abandoned: 0 };
  for (const enrollment of enrollmentsResult.data ?? []) {
    if (enrollment.status in counts) counts[enrollment.status as keyof typeof counts] += 1;
  }

  const lessons = (
    ((course as unknown as { lessons?: LessonRow[] }).lessons ?? []) as LessonRow[]
  )
    .slice()
    .sort((a, b) => a.position - b.position);

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
    lessons: lessons.map((lesson) => ({
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
  const db = createAdminClient();
  const { data: course, error } = await db
    .from("courses")
    .select("slug")
    .eq("id", courseId)
    .maybeSingle();

  if (error) throw error;
  if (!course) return null;
  return getCourseDetailBySlug(course.slug, studentId);
}
