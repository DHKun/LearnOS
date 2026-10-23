import { createHash } from "node:crypto";

import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import { canonicalJson } from "@/lib/crypto/canonical-json";
import { loadCourse, readQuizFile } from "@/lib/content/loader";
import { findEnrollmentForLesson } from "@/lib/services/enrollments";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizPayload, QuizSubmitResult } from "@/lib/types";
import type { QuizQuestion } from "@/lib/content/manifest";
import { gradeQuiz, publicQuizQuestion } from "@/lib/content/quiz";

type QuizInternals = {
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  title: string;
  passScore: number;
  questions: QuizQuestion[];
};

async function loadQuizInternals(lessonId: string): Promise<QuizInternals> {
  const db = createAdminClient();
  const { data: lesson, error } = await db
    .from("lessons")
    .select("id,slug,title,type,course_id,courses(slug)")
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  if (!lesson) throw new ApiError("LESSON_NOT_FOUND");
  if (lesson.type !== "quiz") throw new ApiError("NOT_A_QUIZ");

  const nestedCourse = lesson.courses as { slug: string } | { slug: string }[] | null;
  const course = Array.isArray(nestedCourse) ? nestedCourse[0] : nestedCourse;
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  const loaded = loadCourse(course.slug);
  const manifestLesson = loaded.manifest.lessons.find((item) => item.slug === lesson.slug);
  if (!manifestLesson || manifestLesson.type !== "quiz") {
    throw new ApiError("NOT_A_QUIZ");
  }

  const quiz = readQuizFile(loaded, manifestLesson);
  return {
    lessonId,
    courseSlug: course.slug,
    lessonSlug: lesson.slug,
    title: lesson.title,
    passScore: quiz.passScore,
    questions: quiz.questions,
  };
}

async function requireEnrollment(studentId: string, lessonId: string) {
  const enrollment = await findEnrollmentForLesson(studentId, lessonId);
  if (!enrollment || enrollment.status === "abandoned") {
    throw new ApiError("FORBIDDEN");
  }
  return enrollment;
}

/** Questions without answers or explanations — safe to send to the browser. */
export async function getQuizData(lessonId: string): Promise<QuizPayload> {
  const quiz = await loadQuizInternals(lessonId);
  return {
    lessonId: quiz.lessonId,
    title: quiz.title,
    passScore: quiz.passScore,
    questions: quiz.questions.map(publicQuizQuestion),
  };
}

export async function getQuizForStudent(
  studentId: string,
  lessonId: string,
): Promise<QuizPayload> {
  await requireEnrollment(studentId, lessonId);
  return getQuizData(lessonId);
}

export async function submitQuiz(
  studentId: string,
  lessonId: string,
  attemptId: string,
  answers: Record<string, string | string[]>,
): Promise<QuizSubmitResult> {
  const quiz = await loadQuizInternals(lessonId);
  const enrollment = await requireEnrollment(studentId, lessonId);

  if (enrollment.status !== "active") {
    throw new ApiError("ENROLLMENT_NOT_ACTIVE");
  }

  const { correct, score } = gradeQuiz(quiz.questions, answers);
  const passed = score >= quiz.passScore;
  const requestHash = createHash("sha256")
    .update(canonicalJson({ lessonId, answers }))
    .digest("hex");

  const db = createAdminClient();
  const { data, error } = await db.rpc("record_quiz_attempt", {
    p_student: studentId,
    p_enrollment: enrollment.id,
    p_lesson: lessonId,
    p_attempt_id: attemptId,
    p_score: score,
    p_passed: passed,
    p_answer_summary: {
      correct,
      total: quiz.questions.length,
      passScore: quiz.passScore,
    },
    p_request_hash: requestHash,
  });

  if (error) mapDatabaseError(error);

  const result = data as {
    duplicate: boolean;
    attemptId: string;
    score: number | string;
    passed: boolean;
    courseProgress: { total: number; completed: number; percent: number };
    lessonStatus: string | null;
    enrollmentStatus: string;
    pointsAwarded?: number;
  };

  return {
    attemptId: result.attemptId,
    score: Number(result.score),
    passed: result.passed,
    correctCount: correct,
    questionCount: quiz.questions.length,
    passScore: quiz.passScore,
    duplicate: result.duplicate,
    courseProgress: result.courseProgress,
    lessonStatus: (result.lessonStatus as QuizSubmitResult["lessonStatus"]) ?? null,
    enrollmentStatus: result.enrollmentStatus as QuizSubmitResult["enrollmentStatus"],
    pointsAwarded: result.pointsAwarded ?? 0,
  };
}
