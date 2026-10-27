import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { listCourseSlugs } from "@/lib/content/loader";

/**
 * Learning paths: an ordered list of courses, defined in the repository like
 * courses themselves (`content/paths/<slug>/path.json`). A path stores no
 * state; a learner's position on it is derived from their enrollments.
 *
 * An entry may name a course that does not exist yet. It is shown as
 * "coming soon", so learners see the whole route from the start.
 */
export const PATHS_ROOT = process.env.LEARNOS_PATHS_ROOT
  ? path.resolve(process.env.LEARNOS_PATHS_ROOT)
  : path.join(process.cwd(), "content", "paths");

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符");

export const pathEntrySchema = z.object({
  course: slug,
  /** Why this course sits here on the path, in one sentence. */
  summary: z.string().min(1).max(120),
  /** Required for planned courses (no course folder yet); ignored otherwise. */
  title: z.string().min(1).max(80).optional(),
});

export const pathManifestSchema = z.object({
  schemaVersion: z.literal(1),
  slug,
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(400),
  level: z.enum(["入门", "进阶", "高级"]),
  courses: z.array(pathEntrySchema).min(1).max(30),
});

export type PathEntry = z.infer<typeof pathEntrySchema>;
export type PathManifest = z.infer<typeof pathManifestSchema>;

/** Throws with a readable message when a path is malformed or inconsistent. */
export function checkPath(manifest: unknown, dirName: string, knownCourses: string[]): PathManifest {
  const parsed = pathManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${issue.path.join(".") || "path.json"}：${issue.message}`);
  }
  const value = parsed.data;
  if (value.slug !== dirName) throw new Error(`slug「${value.slug}」与目录名「${dirName}」不一致`);
  const seen = new Set<string>();
  for (const entry of value.courses) {
    if (seen.has(entry.course)) throw new Error(`课程「${entry.course}」在路线中出现了两次`);
    seen.add(entry.course);
    if (!knownCourses.includes(entry.course) && !entry.title) {
      throw new Error(`课程「${entry.course}」还不存在，作为“即将上线”的课程需要写 title`);
    }
  }
  return value;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production" && !process.env.LEARNOS_PATHS_ROOT;
let cache: PathManifest[] | null = null;

export function listPathSlugs(): string[] {
  if (!fs.existsSync(PATHS_ROOT)) return [];
  return fs
    .readdirSync(PATHS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(PATHS_ROOT, entry.name, "path.json")))
    .map((entry) => entry.name)
    .sort();
}

function readPath(dirName: string, knownCourses: string[]): PathManifest {
  const raw = JSON.parse(fs.readFileSync(path.join(PATHS_ROOT, dirName, "path.json"), "utf8"));
  return checkPath(raw, dirName, knownCourses);
}

/** All valid paths. A broken path file is skipped here; `courses:validate` reports it. */
export function loadPaths(): PathManifest[] {
  if (IS_PRODUCTION && cache) return cache;
  const known = listCourseSlugs();
  const paths: PathManifest[] = [];
  for (const dirName of listPathSlugs()) {
    try {
      paths.push(readPath(dirName, known));
    } catch {
      // Never break the course catalog because of one bad path file.
    }
  }
  if (IS_PRODUCTION) cache = paths;
  return paths;
}

export function validateAllPaths(): { slug: string; ok: boolean; error?: string }[] {
  const known = listCourseSlugs();
  return listPathSlugs().map((dirName) => {
    try {
      readPath(dirName, known);
      return { slug: dirName, ok: true };
    } catch (error) {
      return { slug: dirName, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
