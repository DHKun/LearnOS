import fs from "node:fs";
import path from "node:path";

import {
  courseManifestSchema,
  quizFileSchema,
  type CourseManifest,
  type LessonManifest,
  type QuizFile,
} from "@/lib/content/manifest";
import { getValidator } from "@/lib/content/validators.server";

export const CONTENT_ROOT = path.join(process.cwd(), "content", "courses");


export function getLabsOrigin(): string {
  return process.env.NEXT_PUBLIC_LABS_ORIGIN ?? "http://localhost:4310";
}

export function getAllowedLabOrigins(): string[] {
  const configured = process.env.LABS_ALLOWED_ORIGINS ?? process.env.NEXT_PUBLIC_LABS_ORIGIN ?? "";
  return configured
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Resolve the `${LABS_ORIGIN}` placeholder used in course manifests. */
export function resolveEntryUrl(entryUrl: string): string {
  return entryUrl
    .replaceAll("${LABS_ORIGIN}", getLabsOrigin())
    .replaceAll("{LABS_ORIGIN}", getLabsOrigin());
}

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

  const allowedOrigins = getAllowedLabOrigins();
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : null;
  const warnedHosts = new Set<string>();
  for (const lesson of parsed.data.lessons) {
    if (lesson.type !== "interactive") continue;
    const resolved = resolveEntryUrl(lesson.entryUrl);
    let url: URL;
    try {
      url = new URL(resolved);
    } catch {
      throw new Error(`课程 ${slug} 的互动章节 ${lesson.slug} entryUrl 不是合法 URL`);
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`课程 ${slug} 的互动章节 ${lesson.slug} 必须使用 http(s) 地址`);
    }
    if (!allowedOrigins.includes(url.origin)) {
      throw new Error(
        `课程 ${slug} 的互动章节 ${lesson.slug} origin ${url.origin} 不在允许列表 ${allowedOrigins.join(", ")}`,
      );
    }
    if (appOrigin && url.origin === appOrigin) {
      throw new Error(
        `课程 ${slug} 的互动章节 ${lesson.slug} 不能与主应用同源（${appOrigin}）`,
      );
    }
    if (appOrigin && url.hostname === new URL(appOrigin).hostname) {
      if (!warnedHosts.has(url.hostname)) {
        warnedHosts.add(url.hostname);
        console.warn(
          `[learnos] 实验站与主应用使用同一主机名 ${url.hostname}，Cookie 不按端口隔离；生产环境请使用独立域名。`,
        );
      }
    }
    if (!getValidator(lesson.validatorId)) {
      throw new Error(
        `课程 ${slug} 的互动章节 ${lesson.slug} 引用了未注册的 validatorId: ${lesson.validatorId}`,
      );
    }
  }

  return { slug, dir, manifest: parsed.data, files };
}

export function loadAllCourses(): LoadedCourse[] {
  return listCourseSlugs().map(loadCourse);
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
