import type {
  CompletionPolicy,
  CourseProgress,
  EnrollmentStatus,
  EnrollmentSummary,
  LessonProgressStatus,
  LessonType,
} from "@/lib/types";

export type LessonRow = {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  type: LessonType;
  position: number;
  required: boolean;
  completion_policy: CompletionPolicy;
  config: Record<string, unknown> | null;
};

export type EnrollmentRow = {
  id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentStatus;
  current_lesson_id: string | null;
  started_at: string;
  last_seen_at: string | null;
  last_interaction_at: string | null;
  completed_at: string | null;
};

export function computeProgress(
  requiredLessonIds: string[],
  completedLessonIds: Set<string>,
): CourseProgress {
  const total = requiredLessonIds.length;
  const completed = requiredLessonIds.filter((id) => completedLessonIds.has(id)).length;
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= 120_000;
}

export function mapEnrollment(row: EnrollmentRow, progress: CourseProgress): EnrollmentSummary {
  return {
    id: row.id,
    courseId: row.course_id,
    status: row.status,
    currentLessonId: row.current_lesson_id,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    lastInteractionAt: row.last_interaction_at,
    completedAt: row.completed_at,
    progress,
  };
}

export function completedByEnrollment(
  rows: { enrollment_id: string; lesson_id: string; status: LessonProgressStatus }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const set = map.get(row.enrollment_id) ?? new Set<string>();
    set.add(row.lesson_id);
    map.set(row.enrollment_id, set);
  }
  return map;
}

export function progressByEnrollment(
  enrollments: { id: string; course_id: string }[],
  lessons: LessonRow[],
  progressRows: { enrollment_id: string; lesson_id: string; status: LessonProgressStatus }[],
): Map<string, CourseProgress> {
  const requiredByCourse = new Map<string, string[]>();
  for (const lesson of lessons) {
    if (!lesson.required) continue;
    const list = requiredByCourse.get(lesson.course_id) ?? [];
    list.push(lesson.id);
    requiredByCourse.set(lesson.course_id, list);
  }
  const completed = completedByEnrollment(progressRows);
  const result = new Map<string, CourseProgress>();
  for (const enrollment of enrollments) {
    result.set(
      enrollment.id,
      computeProgress(
        requiredByCourse.get(enrollment.course_id) ?? [],
        completed.get(enrollment.id) ?? new Set(),
      ),
    );
  }
  return result;
}

export function enrollmentEntry(row: {
  id: string;
  status: EnrollmentStatus;
  current_lesson_id: string | null;
  started_at: string;
  last_seen_at: string | null;
  last_interaction_at: string | null;
  completed_at: string | null;
  course_id: string;
}): EnrollmentRow {
  return {
    id: row.id,
    student_id: "",
    course_id: row.course_id,
    status: row.status,
    current_lesson_id: row.current_lesson_id,
    started_at: row.started_at,
    last_seen_at: row.last_seen_at,
    last_interaction_at: row.last_interaction_at,
    completed_at: row.completed_at,
  };
}
