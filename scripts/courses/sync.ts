import { createHash } from "node:crypto";

import {
  loadAllCourses,
  readBlockQuizFile,
  type LoadedCourse,
} from "@/lib/content/loader";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { buildCourseUpdate, initialCourseStatus } from "@/lib/content/sync-policy";
import { buildChapterStructure, chapterConfig, resolveChapterCompletion } from "@/lib/content/chapters";
import type { ArticleLessonManifest } from "@/lib/content/manifest";
import { getValidatorFingerprint } from "@/lib/content/validators.server";
import { canonicalJson } from "@/lib/crypto/canonical-json";
import { one, query } from "../db";

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

function chapterStructure(loaded: LoadedCourse, lesson: ArticleLessonManifest) {
  return buildChapterStructure(lesson, {
    quiz: (block) => {
      const quiz = readBlockQuizFile(loaded, lesson, block);
      return {
        quizHash: sha256(canonicalJson(quiz)),
        passScore: block.passScore ?? quiz.passScore,
      };
    },
    validatorFingerprint: (activityId) => {
      const activity = getActivityDefinition(activityId);
      if (!activity) return null;
      return getValidatorFingerprint(activity.validatorId) ?? null;
    },
  });
}

function completionPolicy(lesson: ArticleLessonManifest): "manual" | "server_validated" {
  return resolveChapterCompletion(lesson).mode === "manual" ? "manual" : "server_validated";
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
      row.type !== "article" ||
      row.completion_policy !== completionPolicy(lesson)
    ) {
      return false;
    }

    const config = row.config ?? {};
    const completion = resolveChapterCompletion(lesson);
    const existingCompletion = config.completion as
      | { mode?: string; requiredBlocks?: string[] }
      | undefined;
    const existingMode = existingCompletion?.mode ?? "manual";
    // Practice blocks on a manual chapter never affect completion semantics.
    if (existingMode !== completion.mode) return false;
    if (Boolean(config.finalExam) !== Boolean(lesson.finalExam)) return false;
    if (existingMode === "manual") return true;
    const existingRequired = [...(existingCompletion?.requiredBlocks ?? [])].sort();
    const nextRequired = [...completion.requiredBlocks].sort();
    if (existingRequired.join("|") !== nextRequired.join("|")) return false;
    const next = chapterStructure(loaded, lesson);
    return config.chapterHash === next.hash;
  });
}

/**
 * Sync repository course manifests into the database.
 * - Preserves the admin-managed publish status unless `publish` is explicitly set.
 * - Refuses to change required structure once enrollments exist.
 */
export async function syncCourses(
  options: {
    publish?: boolean;
    publishNew?: boolean;
    refreshMetadata?: boolean;
    /**
     * Explicit one-off migration for adopting the unified chapter model on a
     * course that already has learners. Normal syncs keep the freeze.
     */
    adoptStructure?: boolean;
  } = {},
): Promise<SyncSummary[]> {
  const courses = await loadAllCourses();
  const summaries: SyncSummary[] = [];

  for (const loaded of courses) {
    const { manifest } = loaded;

    const existingCourse = await one<{ id: string; status: string }>(
      "select id,status from public.courses where slug=$1 limit 1",
      [manifest.slug],
    );

    let courseId = existingCourse?.id;
    let created = false;
    let enrollments = 0;
    let existingLessons: DbLesson[] = [];

    if (courseId) {
      const countRow = await one<{ count: string }>(
        "select count(*)::text as count from public.enrollments where course_id=$1",
        [courseId],
      );
      enrollments = Number(countRow?.count ?? 0);

      existingLessons = await query<DbLesson>(
        `select id,slug,position,required,type,completion_policy,config
           from public.lessons where course_id=$1`,
        [courseId],
      );

      if (
        enrollments > 0 &&
        !options.adoptStructure &&
        !structureMatches(loaded, existingLessons)
      ) {
        throw new Error(
          `课程 ${manifest.slug} 已有 ${enrollments} 条学习记录，拒绝改变必修结构、评分规则或题库内容（章节 ID/顺序/类型、完成规则、finalExam、题目内容、activityId、validator）。请使用新的 course slug 发布结构性升级；平台模型迁移可显式使用 --adopt-structure。`,
        );
      }

      const update = buildCourseUpdate(manifest, options);

      const keys = Object.keys(update);
      const values = Object.values(update);
      if (keys.length > 0) {
        await query(
          `update public.courses set ${keys.map((key, index) => `"${key}"=$${index + 1}`).join(",")}
             where id=$${keys.length + 1}`,
          [...values, courseId],
        );
      }
    } else {
      const inserted = await one<{ id: string }>(
        `insert into public.courses (slug,title,description,status,content_version)
         values ($1,$2,$3,$4,$5) returning id`,
        [
          manifest.slug,
          manifest.title,
          manifest.description,
          initialCourseStatus(options),
          manifest.version,
        ],
      );
      if (!inserted) throw new Error("course insert returned no id");
      courseId = inserted.id;
      created = true;
    }

    if (!courseId) throw new Error(`课程 ${manifest.slug} 同步失败：缺少 course id`);

    // Without enrollments the lesson set can be replaced atomically enough for
    // content-as-code workflows; with enrollments the structure is frozen above.
    if (!created && enrollments === 0 && existingLessons.length > 0) {
      await query("delete from public.lessons where course_id=$1", [courseId]);
    }

    for (const [index, lesson] of manifest.lessons.entries()) {
      let config: Record<string, unknown> = lesson.unit ? { unit: lesson.unit } : {};
      const hasChapter =
        (lesson.blocks?.length ?? 0) > 0 ||
        lesson.completion !== undefined ||
        Boolean(lesson.finalExam);
      if (hasChapter) {
        const structure = chapterStructure(loaded, lesson);
        config = {
          ...(lesson.unit ? { unit: lesson.unit } : {}),
          ...chapterConfig(lesson, structure),
        };
      }

      await query(
        `insert into public.lessons
           (course_id,slug,title,position,type,required,content_ref,completion_policy,config)
         values ($1,$2,$3,$4,'article',$5,$6,$7,$8)
         on conflict (course_id,slug) do update set
           title=excluded.title, position=excluded.position, type=excluded.type,
           required=excluded.required, content_ref=excluded.content_ref,
           completion_policy=excluded.completion_policy, config=excluded.config`,
        [
          courseId,
          lesson.slug,
          lesson.title,
          index,
          lesson.required,
          lesson.source,
          completionPolicy(lesson),
          config,
        ],
      );
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
