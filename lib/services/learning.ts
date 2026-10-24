import { sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { mapPgError, one, rpc } from "@/lib/db/query";
import { findEnrollmentForLesson, getOwnedEnrollment } from "@/lib/services/enrollments";

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await rpc<T>(name, args);
  } catch (error) {
    return mapPgError(error);
  }
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
  return call("heartbeat", {
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
  return call("record_event", {
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
  return call("save_state", {
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
  const data = await one<{
    state: Record<string, unknown>;
    version: number;
    updated_at: string;
  }>(sql`
    select state, version, updated_at
    from public.activity_states
    where enrollment_id = ${enrollmentId}::uuid and lesson_id = ${lessonId}::uuid
    limit 1
  `);
  if (!data) return { state: null, version: 0, updatedAt: null };
  return { state: data.state, version: data.version, updatedAt: data.updated_at };
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
  if (!enrollment) throw new ApiError("FORBIDDEN");
  return getStateForEnrollment(enrollment.id, lessonId);
}

/** Verify the caller owns the enrollment before accepting any lesson write. */
export async function assertEnrollmentOwnership(
  studentId: string,
  enrollmentId: string,
  lessonId: string,
): Promise<void> {
  const enrollment = await getOwnedEnrollment(studentId, enrollmentId);
  const lesson = await one<{ id: string; course_id: string }>(sql`
    select id, course_id from public.lessons where id = ${lessonId}::uuid limit 1
  `);
  if (!lesson || lesson.course_id !== enrollment.course_id) {
    throw new ApiError("LESSON_NOT_FOUND");
  }
}
