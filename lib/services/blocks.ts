import { createHash } from "node:crypto";

import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { chapterBlocks } from "@/lib/content/chapters";
import { loadCourse, readBlockQuizFile } from "@/lib/content/loader";
import { gradeQuiz } from "@/lib/content/quiz";
import { getValidator } from "@/lib/content/validators.server";
import { canonicalJson } from "@/lib/crypto/canonical-json";
import { getOwnedEnrollment } from "@/lib/services/enrollments";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BlockResultSummary,
  BlockSubmitResult,
  ChapterBlockKind,
  CourseProgress,
  EnrollmentStatus,
} from "@/lib/types";

async function loadChapterLesson(enrollmentId: string, lessonId: string) {
  const db = createAdminClient();
  const { data: lesson, error } = await db
    .from("lessons")
    .select("id,slug,type,course_id,completion_policy,config,courses(slug)")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) throw new ApiError("LESSON_NOT_FOUND");
  if (lesson.type !== "article") throw new ApiError("SUBMISSION_NOT_ALLOWED");

  const nestedCourse = lesson.courses as { slug: string } | { slug: string }[] | null;
  const course = Array.isArray(nestedCourse) ? nestedCourse[0] : nestedCourse;
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  const loaded = loadCourse(course.slug);
  const manifestLesson = loaded.manifest.lessons.find((item) => item.slug === lesson.slug);
  if (!manifestLesson || manifestLesson.type !== "article") {
    throw new ApiError("SUBMISSION_NOT_ALLOWED");
  }

  return { lesson, loaded, manifestLesson, enrollmentId };
}

export async function getBlockResults(
  enrollmentId: string,
  lessonId: string,
): Promise<Record<string, BlockResultSummary>> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("block_results")
    .select("block_id,block_kind,passed,attempts,last_score,last_feedback,first_passed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId);
  if (error) throw error;
  const map: Record<string, BlockResultSummary> = {};
  for (const row of data ?? []) {
    map[row.block_id] = {
      blockId: row.block_id,
      kind: row.block_kind as ChapterBlockKind,
      passed: row.passed,
      attempts: row.attempts,
      score: row.last_score === null ? null : Number(row.last_score),
      feedback: (row.last_feedback ?? {}) as Record<string, unknown>,
      firstPassedAt: row.first_passed_at,
    };
  }
  return map;
}

export async function submitBlock(
  studentId: string,
  input: {
    attemptId: string;
    enrollmentId: string;
    lessonId: string;
    blockId: string;
    submission: Record<string, unknown>;
  },
): Promise<BlockSubmitResult> {
  const enrollment = await getOwnedEnrollment(studentId, input.enrollmentId);
  const { lesson, loaded, manifestLesson } = await loadChapterLesson(
    input.enrollmentId,
    input.lessonId,
  );
  if (enrollment.course_id !== lesson.course_id) {
    throw new ApiError("LESSON_NOT_FOUND");
  }

  const block = chapterBlocks(manifestLesson).find((item) => item.id === input.blockId);
  if (!block) throw new ApiError("BLOCK_NOT_FOUND");

  let passed = false;
  let score: number | null = null;
  let feedback: Record<string, unknown> = {};

  if (block.kind === "simulation") {
    const activity = getActivityDefinition(block.activityId);
    const validator = activity ? getValidator(activity.validatorId) : null;
    if (!validator) throw new ApiError("SUBMISSION_NOT_ALLOWED");
    const result = await validator(input.submission);
    passed = result.passed;
    score = result.passed ? 100 : 0;
    feedback = result.feedback;
  } else {
    const quiz = readBlockQuizFile(loaded, manifestLesson, block);
    const answers = input.submission.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      throw new ApiError("BAD_REQUEST", "知识检查提交必须包含 answers");
    }
    const graded = gradeQuiz(quiz.questions, answers as Record<string, string | string[]>);
    const passScore = block.passScore ?? quiz.passScore;
    passed = graded.score >= passScore;
    score = graded.score;
    feedback = {
      score: graded.score,
      passScore,
      correctCount: graded.correct,
      questionCount: quiz.questions.length,
      results: graded.results,
    };
  }

  const requestHash = createHash("sha256")
    .update(
      canonicalJson({
        lessonId: input.lessonId,
        blockId: input.blockId,
        kind: block.kind,
        submission: input.submission,
      }),
    )
    .digest("hex");

  const db = createAdminClient();
  const { data, error } = await db.rpc("save_block_result", {
    p_student: studentId,
    p_enrollment: input.enrollmentId,
    p_lesson: input.lessonId,
    p_block_id: input.blockId,
    p_block_kind: block.kind,
    p_attempt_id: input.attemptId,
    p_request_hash: requestHash,
    p_passed: passed,
    p_score: score,
    p_feedback: feedback,
  });
  if (error) mapDatabaseError(error);

  const result = data as {
    accepted: boolean;
    duplicate: boolean;
    passed: boolean;
    score: number | string | null;
    feedback: Record<string, unknown>;
    blockStatus: "passed" | "failed";
    chapterCompletionSatisfied: boolean;
    chapterCompleted: boolean;
    lessonStatus: string | null;
    courseProgress: CourseProgress;
    enrollmentStatus: EnrollmentStatus;
    pointsAwarded: number;
  };

  return {
    accepted: result.accepted,
    duplicate: result.duplicate,
    passed: result.passed,
    score: result.score === null ? null : Number(result.score),
    feedback: result.feedback ?? feedback,
    blockStatus: result.blockStatus,
    chapterCompletionSatisfied: result.chapterCompletionSatisfied,
    chapterCompleted: result.chapterCompleted,
    lessonStatus: result.lessonStatus,
    courseProgress: result.courseProgress,
    enrollmentStatus: result.enrollmentStatus,
    pointsAwarded: result.pointsAwarded ?? 0,
  };
}
