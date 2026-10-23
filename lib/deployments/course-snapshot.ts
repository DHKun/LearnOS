import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { canonicalJson } from "@/lib/crypto/canonical-json";
import { quizFileSchema } from "@/lib/content/manifest";
import type {
  DeploymentCourseSnapshot,
  SnapshotLesson,
  SnapshotPlugin,
} from "@/lib/deployments/types";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const safeRelativePath = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !value.startsWith("/") && !value.includes("..") && !value.includes("\\"), {
    message: "资源路径必须是课程目录内的相对路径",
  });

const exportName = z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/);

/**
 * Scan-only manifest schema.
 *
 * The build-time schema narrows `activityId` to the currently generated
 * registry. A brand-new course has plugins that are not generated yet, so the
 * scanner must accept any id here; `pnpm courses:prepare` performs the strict
 * registry check during deployment.
 */
const scanLessonSchema = z.discriminatedUnion("type", [
  z.object({
    slug: z.string().regex(slugPattern),
    title: z.string().min(1).max(160),
    required: z.boolean().default(true),
    unit: z.string().max(80).optional(),
    type: z.literal("article"),
    source: safeRelativePath,
    completionPolicy: z.enum(["manual", "reported", "server_validated"]).default("manual"),
  }),
  z.object({
    slug: z.string().regex(slugPattern),
    title: z.string().min(1).max(160),
    required: z.boolean().default(true),
    unit: z.string().max(80).optional(),
    type: z.literal("interactive"),
    activityId: z.string().min(1).max(160),
    completionPolicy: z.enum(["manual", "reported", "server_validated"]).default("server_validated"),
    config: z.record(z.unknown()).optional(),
  }),
  z.object({
    slug: z.string().regex(slugPattern),
    title: z.string().min(1).max(160),
    required: z.boolean().default(true),
    unit: z.string().max(80).optional(),
    type: z.literal("quiz"),
    source: safeRelativePath,
    completionPolicy: z.literal("server_validated").default("server_validated"),
    finalExam: z.boolean().optional(),
  }),
]);

const scanConceptSchema = z.object({
  id: z.string().regex(slugPattern),
  legacyGlobalId: z.string().min(1).max(160).optional(),
  component: safeRelativePath,
  export: exportName,
  title: z.string().min(1).max(160).optional(),
  analogy: z.string().min(1).max(500).optional(),
});

const scanActivitySchema = scanConceptSchema.extend({
  validator: z.object({
    id: z.string().min(1).max(160).optional(),
    path: safeRelativePath,
    export: exportName,
  }),
});

const scanManifestSchema = z
  .object({
    schemaVersion: z.number().optional(),
    slug: z.string().regex(slugPattern, "课程 slug 只能使用小写字母、数字和连字符"),
    title: z.string().min(1).max(160),
    description: z.string().max(2000).default(""),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version 必须是 semver，例如 1.0.0"),
    lessons: z.array(scanLessonSchema).min(1, "课程至少需要 1 个章节"),
    plugins: z
      .object({
        concepts: z.array(scanConceptSchema).default([]),
        activities: z.array(scanActivitySchema).default([]),
      })
      .optional(),
  })
  .superRefine((course, ctx) => {
    const slugs = new Set<string>();
    let requiredCount = 0;
    course.lessons.forEach((lesson, index) => {
      if (slugs.has(lesson.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "slug"],
          message: `章节 slug 重复: ${lesson.slug}`,
        });
      }
      slugs.add(lesson.slug);
      if (lesson.required) requiredCount += 1;
      if (lesson.type === "article" && lesson.completionPolicy === "server_validated") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "completionPolicy"],
          message: "图文章节不能使用 server_validated",
        });
      }
      if (lesson.type === "interactive" && lesson.completionPolicy === "manual") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "completionPolicy"],
          message: "交互实验必须使用 reported 或 server_validated",
        });
      }
    });

    if (requiredCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程至少需要 1 个必修章节",
      });
    }

    const finals = course.lessons
      .map((lesson, index) => (lesson.type === "quiz" && lesson.finalExam ? index : -1))
      .filter((index) => index >= 0);
    if (finals.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程必须且只能有一个 finalExam 测验",
      });
    } else if (finals[0] !== course.lessons.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "finalExam 必须是最后一个章节",
      });
    }
  });

type ScanManifest = z.infer<typeof scanManifestSchema>;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestEntries(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const [name, digest] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(name);
    hash.update("\0");
    hash.update(digest);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`)
    .join("; ");
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

/** Resolve a course-relative path and refuse any symlink that escapes the course. */
export function resolveCourseFile(courseDir: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\")) {
    throw new Error(`非法课程资源路径: ${relative}`);
  }
  if (relative.split(/[\\/]/).includes("..")) {
    throw new Error(`课程资源路径不能包含 ..: ${relative}`);
  }

  const realCourse = fs.realpathSync(courseDir);
  const candidate = path.resolve(courseDir, relative);
  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new Error(`文件不存在: ${relative}`);
  }
  if (!isInside(realCourse, real)) {
    throw new Error(`路径越出课程目录（含符号链接）: ${relative}`);
  }
  return real;
}

function listCourseFiles(courseDir: string): { relative: string; real: string }[] {
  const realCourse = fs.realpathSync(courseDir);
  const seenDirs = new Set<string>();
  const files: { relative: string; real: string }[] = [];

  const walk = (dir: string) => {
    const realDir = fs.realpathSync(dir);
    if (seenDirs.has(realDir)) return;
    seenDirs.add(realDir);

    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      let real = full;

      if (entry.isSymbolicLink()) {
        try {
          real = fs.realpathSync(full);
        } catch {
          throw new Error(`符号链接无法解析: ${entry.name}`);
        }
        if (!isInside(realCourse, real)) {
          throw new Error(`符号链接越出课程目录: ${entry.name}`);
        }
      }

      const stat = fs.statSync(real);
      if (stat.isDirectory()) {
        walk(real);
      } else if (stat.isFile()) {
        const relative = path.relative(courseDir, full).replaceAll("\\", "/");
        if (relative.startsWith("..")) {
          throw new Error(`文件越出课程目录: ${entry.name}`);
        }
        files.push({ relative, real });
      }
    }
  };

  walk(courseDir);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function hasExport(file: string, name: string): boolean {
  const source = fs.readFileSync(file, "utf8");
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(source);
}

function readManifest(courseDir: string): ScanManifest {
  const manifestPath = path.join(courseDir, "course.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("缺少 course.json");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `course.json 不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = scanManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`course.json 校验失败: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * Build a deterministic snapshot of one course directory.
 * Throws when the directory is unreadable or structurally invalid.
 */
export function buildCourseSnapshot(
  courseDir: string,
  directorySlug?: string,
): DeploymentCourseSnapshot {
  const manifest = readManifest(courseDir);
  if (directorySlug && manifest.slug !== directorySlug) {
    throw new Error(`课程目录 ${directorySlug} 与清单 slug ${manifest.slug} 不一致`);
  }

  const files = listCourseFiles(courseDir);
  const fileHashes: Record<string, string> = {};
  for (const file of files) {
    fileHashes[file.relative] = sha256(fs.readFileSync(file.real));
  }

  const plugins = manifest.plugins ?? { concepts: [], activities: [] };
  const concepts: SnapshotPlugin[] = plugins.concepts.map((concept) => {
    const globalId = concept.legacyGlobalId ?? `${manifest.slug}/${concept.id}`;
    const component = resolveCourseFile(courseDir, concept.component);
    if (!hasExport(component, concept.export)) {
      throw new Error(`概念 ${concept.id} 的组件未导出 ${concept.export}`);
    }
    return {
      id: concept.id,
      globalId,
      component: concept.component,
      export: concept.export,
      title: concept.title,
      analogy: concept.analogy,
    };
  });

  const activities: SnapshotPlugin[] = plugins.activities.map((activity) => {
    const globalId = activity.legacyGlobalId ?? `${manifest.slug}/${activity.id}`;
    const component = resolveCourseFile(courseDir, activity.component);
    if (!hasExport(component, activity.export)) {
      throw new Error(`活动 ${activity.id} 的组件未导出 ${activity.export}`);
    }
    const validatorFile = resolveCourseFile(courseDir, activity.validator.path);
    if (!hasExport(validatorFile, activity.validator.export)) {
      throw new Error(`活动 ${activity.id} 的验证器未导出 ${activity.validator.export}`);
    }
    const validatorId = activity.validator.id ?? globalId;
    return {
      id: activity.id,
      globalId,
      component: activity.component,
      export: activity.export,
      title: activity.title,
      validatorId,
      validatorPath: activity.validator.path,
      validatorExport: activity.validator.export,
      validatorFingerprint: sha256(fs.readFileSync(validatorFile)),
    };
  });

  const conceptIds = new Set<string>();
  for (const concept of concepts) {
    if (conceptIds.has(concept.globalId)) throw new Error(`概念 ID 重复: ${concept.globalId}`);
    conceptIds.add(concept.globalId);
  }
  const activityIds = new Set<string>();
  const validatorIds = new Set<string>();
  for (const activity of activities) {
    if (activityIds.has(activity.globalId)) throw new Error(`活动 ID 重复: ${activity.globalId}`);
    activityIds.add(activity.globalId);
    if (!activity.validatorId) continue;
    if (validatorIds.has(activity.validatorId)) {
      throw new Error(`Validator ID 重复: ${activity.validatorId}`);
    }
    validatorIds.add(activity.validatorId);
  }

  const activityById = new Map(activities.map((activity) => [activity.globalId, activity]));
  const lessons: SnapshotLesson[] = manifest.lessons.map((lesson, position) => {
    const base: SnapshotLesson = {
      slug: lesson.slug,
      title: lesson.title,
      position,
      type: lesson.type,
      required: lesson.required,
      completionPolicy: lesson.completionPolicy,
    };

    if (lesson.type === "article") {
      resolveCourseFile(courseDir, lesson.source);
      return base;
    }

    if (lesson.type === "quiz") {
      const quizPath = resolveCourseFile(courseDir, lesson.source);
      let quiz: z.infer<typeof quizFileSchema>;
      try {
        const parsed = quizFileSchema.safeParse(JSON.parse(fs.readFileSync(quizPath, "utf8")));
        if (!parsed.success) throw new Error(formatIssues(parsed.error));
        quiz = parsed.data;
      } catch (error) {
        throw new Error(
          `测验 ${lesson.slug} 校验失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {
        ...base,
        passScore: quiz.passScore,
        finalExam: Boolean(lesson.finalExam),
        quizHash: sha256(canonicalJson(quiz)),
      };
    }

    const activity = activityById.get(lesson.activityId);
    if (!activity) {
      throw new Error(`互动章节 ${lesson.slug} 引用了未声明 activityId: ${lesson.activityId}`);
    }
    return {
      ...base,
      activityId: lesson.activityId,
      validatorId: activity.validatorId,
      validatorFingerprint: activity.validatorFingerprint,
      validatorFingerprintVersion: 2,
    };
  });

  const structuralDigest = sha256(
    canonicalJson({
      lessons,
      activities: activities
        .map((activity) => ({
          globalId: activity.globalId,
          validatorId: activity.validatorId,
          validatorFingerprint: activity.validatorFingerprint,
        }))
        .sort((a, b) => a.globalId.localeCompare(b.globalId)),
    }),
  );

  return {
    slug: manifest.slug,
    title: manifest.title,
    version: manifest.version,
    description: manifest.description,
    sourceDigest: digestEntries(fileHashes),
    structuralDigest,
    files: fileHashes,
    lessons,
    concepts,
    activities,
  };
}
