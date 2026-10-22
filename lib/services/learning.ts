import { createHash } from "node:crypto";

import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import { loadCourse } from "@/lib/content/loader";
import { getValidator } from "@/lib/content/validators.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findEnrollmentForLesson, getOwnedEnrollment } from "@/lib/services/enrollments";
import type { CourseProgress } from "@/lib/types";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = createAdminClient();
  const { data, error } = await db.rpc(name, args);
  if (error) mapDatabaseError(error);
  return data as T;
}

export async function recordHeartbeat(
  studentId: string,
  enrollmentId: string,
  lessonId: string | null,
  visible: boolean,
  focused: boolean,
): Promise<{
  lastSeenAt: string;
  lastInteractionAt: string | null;
  currentLessonId: string | null;
  status: string;
}> {
  return rpc("heartbeat", {
    p_student: studentId,
    p_enrollment: enrollmentId,
    p_lesson: lessonId,
    p_visible: visible,
    p_focused: focused,
  });
}

export async function recordEvent(
  studentId: string,
  input: {
    id: string;
    enrollmentId: string;
    lessonId: string;
    type: string;
    stepId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<{ accepted: boolean; duplicate: boolean }> {
  return rpc("record_event", {
    p_student: studentId,
    p_enrollment: input.enrollmentId,
    p_lesson: input.lessonId,
    p_event_id: input.id,
    p_type: input.type,
    p_step: input.stepId ?? null,
    p_payload: input.payload ?? {},
  });
}

export async function saveState(
  studentId: string,
  enrollmentId: string,
  lessonId: string,
  state: Record<string, unknown>,
  expectedVersion: number,
): Promise<{ version: number; updatedAt: string }> {
  return rpc("save_state", {
    p_student: studentId,
    p_enrollment: enrollmentId,
    p_lesson: lessonId,
    p_state: state,
    p_expected_version: expectedVersion,
  });
}

export async function getStateForEnrollment(
  enrollmentId: string,
  lessonId: string,
): Promise<{
  state: Record<string, unknown> | null;
  version: number;
  updatedAt: string | null;
}> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("activity_states")
    .select("state,version,updated_at")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { state: null, version: 0, updatedAt: null };
  return {
    state: data.state as Record<string, unknown>,
    version: data.version,
    updatedAt: data.updated_at,
  };
}

export async function getState(
  studentId: string,
  lessonId: string,
): Promise<{
  state: Record<string, unknown> | null;
  version: number;
  updatedAt: string | null;
}> {
  const enrollment = await findEnrollmentForLesson(studentId, lessonId);
  const db = createAdminClient();

  if (!enrollment) {
    throw new ApiError("FORBIDDEN");
  }

  const { data, error } = await db
    .from("activity_states")
    .select("state,version,updated_at")
    .eq("enrollment_id", enrollment.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { state: null, version: 0, updatedAt: null };

  return { state: data.state as Record<string, unknown>, version: data.version, updatedAt: data.updated_at };
}

async function loadInteractiveLesson(lessonId: string) {
  const db = createAdminClient();
  const { data: lesson, error } = await db
    .from("lessons")
    .select("id,slug,type,course_id,completion_policy,config")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) throw new ApiError("LESSON_NOT_FOUND");

  const { data: course, error: courseError } = await db
    .from("courses")
    .select("slug")
    .eq("id", lesson.course_id)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  const loaded = loadCourse(course.slug);
  const manifestLesson = loaded.manifest.lessons.find((item) => item.slug === lesson.slug);
  return { lesson, course, loaded, manifestLesson };
}

export async function submitInteraction(
  studentId: string,
  input: {
    id: string;
    enrollmentId: string;
    lessonId: string;
    submission: Record<string, unknown>;
  },
): Promise<{
  accepted: boolean;
  duplicate: boolean;
  passed: boolean;
  feedback: Record<string, unknown>;
  lessonStatus: string | null;
  courseProgress: CourseProgress;
  enrollmentStatus?: string;
  pointsAwarded?: number;
}> {
  const { lesson, manifestLesson } = await loadInteractiveLesson(input.lessonId);

  if (
    lesson.type !== "interactive" ||
    lesson.completion_policy !== "server_validated" ||
    !manifestLesson ||
    manifestLesson.type !== "interactive"
  ) {
    throw new ApiError("SUBMISSION_NOT_ALLOWED");
  }

  const validator = getValidator(manifestLesson.validatorId);
  if (!validator) throw new ApiError("SUBMISSION_NOT_ALLOWED");

  const result = await validator(input.submission);
  const hash = createHash("sha256")
    .update(JSON.stringify({ lessonId: input.lessonId, submission: input.submission }))
    .digest("hex");

  const saved = await rpc<{
    accepted: boolean;
    duplicate: boolean;
    passed: boolean;
    feedback: Record<string, unknown>;
    lessonStatus: string | null;
    courseProgress: CourseProgress;
    enrollmentStatus?: string;
    pointsAwarded?: number;
  }>("save_submission", {
    p_student: studentId,
    p_enrollment: input.enrollmentId,
    p_lesson: input.lessonId,
    p_submission_id: input.id,
    p_submission_hash: hash,
    p_passed: result.passed,
    p_feedback: result.feedback,
  });

  return saved;
}

/** Verify the caller owns the enrollment before accepting any lesson write. */
export async function assertEnrollmentOwnership(
  studentId: string,
  enrollmentId: string,
  lessonId: string,
): Promise<void> {
  const enrollment = await getOwnedEnrollment(studentId, enrollmentId);
  const db = createAdminClient();
  const { data: lesson, error } = await db
    .from("lessons")
    .select("id,course_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson || lesson.course_id !== enrollment.course_id) {
    throw new ApiError("LESSON_NOT_FOUND");
  }
}
