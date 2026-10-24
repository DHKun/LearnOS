import { sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { mapPgError, one, rpc } from "@/lib/db/query";
import type { EnrollmentSummary } from "@/lib/types";

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(name, args);
  } catch (error) {
    return mapPgError(error);
  }
}

export async function joinCourse(
  studentId: string,
  courseId: string,
): Promise<EnrollmentSummary> {
  return call<EnrollmentSummary>("join_course", {
    p_student: studentId,
    p_course: courseId,
  });
}

export async function abandonCourse(
  studentId: string,
  enrollmentId: string,
): Promise<EnrollmentSummary> {
  return call<EnrollmentSummary>("abandon_course", {
    p_student: studentId,
    p_enrollment: enrollmentId,
  });
}

export async function completeLesson(
  studentId: string,
  enrollmentId: string,
  lessonId: string,
  source: "manual" | "reported" = "manual",
): Promise<{
  lessonStatus: string;
  courseProgress: { total: number; completed: number; percent: number };
  enrollmentStatus: string;
  pointsAwarded: number;
  alreadyCompleted: boolean;
}> {
  return call("complete_lesson", {
    p_student: studentId,
    p_enrollment: enrollmentId,
    p_lesson: lessonId,
    p_source: source,
  });
}

export type OwnedEnrollment = {
  id: string;
  course_id: string;
  status: string;
  current_lesson_id: string | null;
};

export async function getOwnedEnrollment(
  studentId: string,
  enrollmentId: string,
): Promise<OwnedEnrollment> {
  const data = await one<OwnedEnrollment>(sql`
    select id, course_id, status, current_lesson_id
    from public.enrollments
    where id = ${enrollmentId}::uuid and student_id = ${studentId}::uuid
    limit 1
  `);
  if (!data) throw new ApiError("ENROLLMENT_NOT_FOUND");
  return data;
}

/** Prefer the active enrollment; fall back to the latest completed one for review. */
export async function findEnrollmentForLesson(
  studentId: string,
  lessonId: string,
): Promise<OwnedEnrollment | null> {
  const lesson = await one<{ id: string; course_id: string }>(sql`
    select id, course_id from public.lessons where id = ${lessonId}::uuid limit 1
  `);
  if (!lesson) return null;

  const data = await one<OwnedEnrollment>(sql`
    select id, course_id, status, current_lesson_id
    from public.enrollments
    where student_id = ${studentId}::uuid and course_id = ${lesson.course_id}::uuid
    order by started_at desc
    limit 1
  `);
  return data ?? null;
}
