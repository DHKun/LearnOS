import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import type { EnrollmentSummary } from "@/lib/types";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = createAdminClient();
  const { data, error } = await db.rpc(name, args);
  if (error) mapDatabaseError(error);
  return data as T;
}

export async function joinCourse(
  studentId: string,
  courseId: string,
): Promise<EnrollmentSummary> {
  return rpc<EnrollmentSummary>("join_course", {
    p_student: studentId,
    p_course: courseId,
  });
}

export async function abandonCourse(
  studentId: string,
  enrollmentId: string,
): Promise<EnrollmentSummary> {
  return rpc<EnrollmentSummary>("abandon_course", {
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
  return rpc("complete_lesson", {
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
  const db = createAdminClient();
  const { data, error } = await db
    .from("enrollments")
    .select("id,course_id,status,current_lesson_id")
    .eq("id", enrollmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("ENROLLMENT_NOT_FOUND");
  return data as OwnedEnrollment;
}

/** Prefer the active enrollment; fall back to the latest completed one for review. */
export async function findEnrollmentForLesson(
  studentId: string,
  lessonId: string,
): Promise<OwnedEnrollment | null> {
  const db = createAdminClient();
  const { data: lesson, error } = await db
    .from("lessons")
    .select("id,course_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) return null;

  const { data, error: enrollmentError } = await db
    .from("enrollments")
    .select("id,course_id,status,current_lesson_id")
    .eq("student_id", studentId)
    .eq("course_id", lesson.course_id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (enrollmentError) throw enrollmentError;
  return (data as OwnedEnrollment | null) ?? null;
}
