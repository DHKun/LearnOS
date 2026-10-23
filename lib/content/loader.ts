import fs from "node:fs";
import path from "node:path";

import {
  courseManifestSchema,
  quizFileSchema,
  type CourseManifest,
  type LessonManifest,
  type QuizFile,
} from "@/lib/content/manifest";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { isConceptId } from "@/lib/education/concepts";
import { getValidator } from "@/lib/content/validators.server";

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
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(CONTENT_ROOT, entry.name, "course.json")))
    .map((entry) => entry.name)
    .sort();
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export type LoadedCourse = {
  slug: string;
  dir: string;
  manifest: CourseManifest;
  /** Lesson files resolved from the manifest, keyed by lesson slug. */
  files: Record<string, string>;
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
  for (const lesson of parsed.data.lessons) {
    if (lesson.type === "article" || lesson.type === "quiz") {
      const absolute = path.resolve(dir, lesson.source);
      if (!absolute.startsWith(`${path.resolve(dir)}${path.sep}`)) {
        throw new Error(`课程 ${slug} 的章节 ${lesson.slug} 引用了目录外的文件`);
      }
      if (!fs.existsSync(absolute)) {
        throw new Error(`课程 ${slug} 的章节 ${lesson.slug} 缺少资源文件: ${lesson.source}`);
      }
      if (lesson.type === "article" && !lesson.source.endsWith(".mdx")) {
        throw new Error(`课程 ${slug} 的图文章节 ${lesson.slug} 必须使用 .mdx 资源`);
      }
      if (lesson.type === "quiz") {
        const quiz = quizFileSchema.safeParse(readJson(absolute));
        if (!quiz.success) {
          throw new Error(
            `课程 ${slug} 的测验 ${lesson.slug} 校验失败: ${quiz.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
          );
        }
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

  return { slug, dir, manifest: parsed.data, files };
}

export function loadAllCourses(): LoadedCourse[] {
  return listCourseSlugs().map((slug) => {
    const course = loadCourse(slug);
    for (const lesson of course.manifest.lessons) {
      if (lesson.type !== "article") continue;
      const source = readArticleSource(course, lesson);
      for (const match of source.matchAll(/<ConceptPlayer[^>]*conceptId=["']([^"']+)["']/g)) {
        if (!isConceptId(match[1])) {
          throw new Error(`课程 ${slug} 章节 ${lesson.slug} 引用了未注册的概念动画: ${match[1]}`);
        }
      }
    }
    return course;
  });
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

export type CourseValidationResult = {
  slug: string;
  ok: boolean;
  error?: string;
};

export function validateAllCourses(): CourseValidationResult[] {
  return listCourseSlugs().map((slug) => {
    try {
      loadCourse(slug);
      return { slug, ok: true };
    } catch (error) {
      return { slug, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
