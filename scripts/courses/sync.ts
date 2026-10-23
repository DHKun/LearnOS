import { createHash } from "node:crypto";

import { loadAllCourses, readQuizFile, type LoadedCourse } from "@/lib/content/loader";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { buildCourseUpdate, initialCourseStatus } from "@/lib/content/sync-policy";
import { getValidator, getValidatorFingerprint } from "@/lib/content/validators.server";
import { canonicalJson } from "@/lib/crypto/canonical-json";
import { createAdminClient } from "@/lib/supabase/admin";

export type SyncSummary = {
  slug: string;
  courseId: string;
  created: boolean;
  lessonCount: number;
  enrollments: number;
};

export type DbLesson = {
  id: string;
  slug: string;
  position: number;
  required: boolean;
  type: string;
  completion_policy: string;
  config: Record<string, unknown> | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function structureMatches(loaded: LoadedCourse, existing: DbLesson[]): boolean {
  if (loaded.manifest.lessons.length !== existing.length) return false;
  const sorted = [...existing].sort((a, b) => a.position - b.position);
  return loaded.manifest.lessons.every((lesson, index) => {
    const row = sorted[index];
    if (row === undefined) return false;
    if (
      row.slug !== lesson.slug ||
      row.position !== index ||
      row.required !== lesson.required ||
      row.type !== lesson.type ||
      row.completion_policy !== lesson.completionPolicy
    ) {
      return false;
    }

    const config = row.config ?? {};
    if (lesson.type === "quiz") {
      const quiz = readQuizFile(loaded, lesson);
      // Grading rules and actual question content are frozen once learners exist.
      if (Number(config.passScore) !== quiz.passScore) return false;
      if (Boolean(config.finalExam) !== Boolean(lesson.finalExam)) return false;
      if (config.quizHash !== sha256(canonicalJson(quiz))) return false;
    }
    if (lesson.type === "interactive") {
      const activity = getActivityDefinition(lesson.activityId);
      if (!activity) return false;
      if (config.activityId !== lesson.activityId) return false;
      if (config.validatorId !== activity.validatorId) return false;
      const validator = getValidator(activity.validatorId);
      if (!validator) return false;
      const fingerprint = getValidatorFingerprint(activity.validatorId);
      if (
        config.validatorFingerprintVersion === 2 &&
        config.validatorFingerprint !== fingerprint
      ) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sync repository course manifests into the database.
 * - Preserves the admin-managed publish status unless `publish` is explicitly set.
 * - Refuses to change required structure once enrollments exist.
 */
export async function syncCourses(
  options: { publish?: boolean; publishNew?: boolean; refreshMetadata?: boolean } = {},
): Promise<SyncSummary[]> {
  const db = createAdminClient();
  const courses = loadAllCourses();
  const summaries: SyncSummary[] = [];

  for (const loaded of courses) {
    const { manifest } = loaded;

    const { data: existingCourse, error: courseError } = await db
      .from("courses")
      .select("id,status")
      .eq("slug", manifest.slug)
      .maybeSingle();
    if (courseError) throw courseError;

    let courseId = existingCourse?.id as string | undefined;
    let created = false;
    let enrollments = 0;
    let existingLessons: DbLesson[] = [];

    if (courseId) {
      const { count, error: countError } = await db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId);
      if (countError) throw countError;
      enrollments = count ?? 0;

      const { data: lessons, error: lessonsError } = await db
        .from("lessons")
        .select("id,slug,position,required,type,completion_policy,config")
        .eq("course_id", courseId);
      if (lessonsError) throw lessonsError;
      existingLessons = (lessons ?? []) as DbLesson[];

      if (enrollments > 0 && !structureMatches(loaded, existingLessons)) {
        throw new Error(
          `课程 ${manifest.slug} 已有 ${enrollments} 条学习记录，拒绝改变必修结构、评分规则或题库内容（章节 ID/顺序/类型、完成策略、及格线、finalExam、题目内容、activityId、validator）。请使用新的 course slug 发布结构性升级。`,
        );
      }

      const update = buildCourseUpdate(manifest, options);

      const { error: updateError } = await db.from("courses").update(update).eq("id", courseId);
      if (updateError) throw updateError;
    } else {
      const { data: inserted, error: insertError } = await db
        .from("courses")
        .insert({
          slug: manifest.slug,
          title: manifest.title,
          description: manifest.description,
          status: initialCourseStatus(options),
          content_version: manifest.version,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      courseId = inserted.id as string;
      created = true;
    }

    if (!courseId) throw new Error(`课程 ${manifest.slug} 同步失败：缺少 course id`);

    // Without enrollments the lesson set can be replaced atomically enough for
    // content-as-code workflows; with enrollments the structure is frozen above.
    if (!created && enrollments === 0 && existingLessons.length > 0) {
      const { error: deleteError } = await db.from("lessons").delete().eq("course_id", courseId);
      if (deleteError) throw deleteError;
    }

    for (const [index, lesson] of manifest.lessons.entries()) {
      let config: Record<string, unknown> = lesson.unit ? { unit: lesson.unit } : {};
      let contentRef: string | null = null;

      if (lesson.type === "article") {
        contentRef = lesson.source;
      } else if (lesson.type === "interactive") {
        const activity = getActivityDefinition(lesson.activityId);
        if (!activity) throw new Error(`未注册的 activityId: ${lesson.activityId}`);
        const validator = getValidator(activity.validatorId);
        if (!validator) {
          throw new Error(`缺少服务端验证器: ${activity.validatorId}`);
        }
        config = {
          activityId: lesson.activityId,
          validatorId: activity.validatorId,
          validatorFingerprint: getValidatorFingerprint(activity.validatorId) ?? null,
          validatorFingerprintVersion: 2,
          ...(lesson.unit ? { unit: lesson.unit } : {}),
          ...(lesson.config ?? {}),
        };
      } else {
        contentRef = lesson.source;
        const quiz = readQuizFile(loaded, lesson);
        config = {
          passScore: quiz.passScore,
          questionCount: quiz.questions.length,
          finalExam: Boolean(lesson.finalExam),
          ...(lesson.unit ? { unit: lesson.unit } : {}),
          quizHash: sha256(canonicalJson(quiz)),
        };
      }

      const { error: lessonError } = await db.from("lessons").upsert(
        {
          course_id: courseId,
          slug: lesson.slug,
          title: lesson.title,
          position: index,
          type: lesson.type,
          required: lesson.required,
          content_ref: contentRef,
          completion_policy: lesson.completionPolicy,
          config,
        },
        { onConflict: "course_id,slug" },
      );
      if (lessonError) throw lessonError;
    }

    summaries.push({
      slug: manifest.slug,
      courseId,
      created,
      lessonCount: manifest.lessons.length,
      enrollments,
    });
  }

  return summaries;
}
