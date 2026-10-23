import fs from "node:fs";
import path from "node:path";

import {
  courseManifestSchema,
  quizFileSchema,
  type ArticleLessonManifest,
  type ChapterBlock,
  type CourseManifest,
  type LessonManifest,
  type QuizFile,
} from "@/lib/content/manifest";
import { chapterBlocks, validateChapterBlocks } from "@/lib/content/chapters";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { isConceptId } from "@/lib/education/concepts";
import { getValidator } from "@/lib/content/validators.server";
import { validateChapterMdx } from "@/lib/content/mdx-validation";

/**
 * Course source root. `LEARNOS_CONTENT_ROOT` lets tooling (deployment
 * snapshots and tests) point at a fixed copy without touching the live tree.
 */
export const CONTENT_ROOT = process.env.LEARNOS_CONTENT_ROOT
  ? path.resolve(process.env.LEARNOS_CONTENT_ROOT)
  : path.join(process.cwd(), "content", "courses");

export function courseDir(slug: string): string {
  return path.join(CONTENT_ROOT, slug);
}

export function listCourseSlugs(): string[] {
  if (!fs.existsSync(CONTENT_ROOT)) return [];
  return fs
    .readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(CONTENT_ROOT, entry.name, "course.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeFile(dir: string, relative: string, label: string): string {
  const absolute = path.resolve(dir, relative);
  const root = fs.realpathSync(dir);
  if (!absolute.startsWith(`${path.resolve(dir)}${path.sep}`)) {
    throw new Error(`${label} 引用了课程目录外的文件: ${relative}`);
  }
  let real: string;
  try {
    real = fs.realpathSync(absolute);
  } catch {
    throw new Error(`${label} 缺少资源文件: ${relative}`);
  }
  if (!real.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} 通过符号链接逃出课程目录: ${relative}`);
  }
  return real;
}

export type LoadedCourse = {
  slug: string;
  dir: string;
  manifest: CourseManifest;
  /** Lesson files resolved from the manifest, keyed by lesson slug. */
  files: Record<string, string>;
  /** Question-block files keyed by `${lessonSlug}::${blockId}`. */
  blockFiles: Record<string, string>;
};

/** Load and validate a single course from disk. Throws on invalid content. */
export function loadCourse(slug: string): LoadedCourse {
  const dir = courseDir(slug);
  const manifestPath = path.join(dir, "course.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到课程清单: ${manifestPath}`);
  }

  const parsed = courseManifestSchema.safeParse(readJson(manifestPath));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`课程 ${slug} 清单校验失败: ${detail}`);
  }

  if (parsed.data.slug !== slug) {
    throw new Error(`课程目录 ${slug} 与清单 slug ${parsed.data.slug} 不一致`);
  }

  const files: Record<string, string> = {};
  const blockFiles: Record<string, string> = {};

  for (const lesson of parsed.data.lessons) {
    if (lesson.type === "article") {
      const absolute = safeFile(dir, lesson.source, `课程 ${slug} 的章节 ${lesson.slug}`);
      if (!lesson.source.endsWith(".mdx")) {
        throw new Error(`课程 ${slug} 的图文章节 ${lesson.slug} 必须使用 .mdx 资源`);
      }
      files[lesson.slug] = absolute;
      validateChapterBlocks(lesson);

      for (const block of chapterBlocks(lesson)) {
        if (block.kind === "simulation") {
          const activity = getActivityDefinition(block.activityId);
          if (!activity) {
            throw new Error(
              `课程 ${slug} 的章节 ${lesson.slug} Block ${block.id} 引用了未注册的 activityId: ${block.activityId}`,
            );
          }
          if (!getValidator(activity.validatorId)) {
            throw new Error(
              `课程 ${slug} 的章节 ${lesson.slug} Block ${block.id} 缺少服务端验证器: ${activity.validatorId}`,
            );
          }
        } else {
          const quizPath = safeFile(
            dir,
            block.source,
            `课程 ${slug} 的章节 ${lesson.slug} 知识检查 ${block.id}`,
          );
          const quiz = quizFileSchema.safeParse(readJson(quizPath));
          if (!quiz.success) {
            throw new Error(
              `课程 ${slug} 的章节 ${lesson.slug} 知识检查 ${block.id} 校验失败: ${quiz.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ")}`,
            );
          }
          blockFiles[`${lesson.slug}::${block.id}`] = quizPath;
        }
      }
    } else if (lesson.type === "quiz") {
      const absolute = safeFile(dir, lesson.source, `课程 ${slug} 的测验 ${lesson.slug}`);
      const quiz = quizFileSchema.safeParse(readJson(absolute));
      if (!quiz.success) {
        throw new Error(
          `课程 ${slug} 的测验 ${lesson.slug} 校验失败: ${quiz.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      files[lesson.slug] = absolute;
    }
  }

  for (const lesson of parsed.data.lessons) {
    if (lesson.type !== "interactive") continue;
    const activity = getActivityDefinition(lesson.activityId);
    if (!activity) {
      throw new Error(
        `课程 ${slug} 的互动章节 ${lesson.slug} 引用了未注册的 activityId: ${lesson.activityId}`,
      );
    }
    if (!getValidator(activity.validatorId)) {
      throw new Error(
        `课程 ${slug} 的互动章节 ${lesson.slug} 缺少服务端验证器: ${activity.validatorId}`,
      );
    }
  }

  return { slug, dir, manifest: parsed.data, files, blockFiles };
}

function validateArticleMdx(course: LoadedCourse, lesson: ArticleLessonManifest): void {
  validateChapterMdx({
    source: readArticleSource(course, lesson),
    label: `课程 ${course.slug} 的章节 ${lesson.slug}`,
    blocks: chapterBlocks(lesson),
    isConcept: isConceptId,
    activityExists: (activityId) => Boolean(getActivityDefinition(activityId)),
  });
}

export async function loadAllCourses(): Promise<LoadedCourse[]> {
  const slugs = listCourseSlugs();
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const course = loadCourse(slug);
      for (const lesson of course.manifest.lessons) {
        if (lesson.type === "article") validateArticleMdx(course, lesson);
      }
      return course;
    }),
  );
  return results;
}

export function readArticleSource(course: LoadedCourse, lesson: LessonManifest): string {
  const file = course.files[lesson.slug];
  if (!file) throw new Error(`课程 ${course.slug} 缺少章节 ${lesson.slug} 的资源`);
  return fs.readFileSync(file, "utf8");
}

/** Server-only: read the quiz including answers. Never send this object to a client. */
export function readQuizFile(course: LoadedCourse, lesson: LessonManifest): QuizFile {
  const file = course.files[lesson.slug];
  if (!file) throw new Error(`课程 ${course.slug} 缺少测验 ${lesson.slug} 的资源`);
  const parsed = quizFileSchema.safeParse(readJson(file));
  if (!parsed.success) {
    throw new Error(`课程 ${course.slug} 的测验 ${lesson.slug} 无效`);
  }
  return parsed.data;
}

export function readBlockQuizFile(
  course: LoadedCourse,
  lesson: LessonManifest,
  block: Extract<ChapterBlock, { kind: "question" }>,
): QuizFile {
  const file = course.blockFiles[`${lesson.slug}::${block.id}`];
  if (!file) {
    throw new Error(`课程 ${course.slug} 缺少章节 ${lesson.slug} Block ${block.id} 的题库`);
  }
  const parsed = quizFileSchema.safeParse(readJson(file));
  if (!parsed.success) {
    throw new Error(`课程 ${course.slug} 的章节 ${lesson.slug} Block ${block.id} 题库无效`);
  }
  return parsed.data;
}

export type CourseValidationResult = {
  slug: string;
  ok: boolean;
  error?: string;
};

export async function validateAllCourses(): Promise<CourseValidationResult[]> {
  return Promise.all(
    listCourseSlugs().map(async (slug) => {
      try {
        const course = loadCourse(slug);
        for (const lesson of course.manifest.lessons) {
          if (lesson.type === "article") validateArticleMdx(course, lesson);
        }
        return { slug, ok: true };
      } catch (error) {
        return {
          slug,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
