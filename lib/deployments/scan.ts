import fs from "node:fs";
import path from "node:path";

import { CONTENT_ROOT } from "@/lib/content/loader";
import { buildCourseSnapshot } from "@/lib/deployments/course-snapshot";
import type {
  CourseScanFailure,
  CourseScanStatus,
  DeploymentCourseSnapshot,
  DeploymentScan,
  ScannedCourse,
} from "@/lib/deployments/types";

/**
 * The running web image contains the last deployed content. The admin scan
 * must instead see the host working copy (including a course directory that
 * was just copied in). Compose mounts it read-only and points this env here;
 * runtime content still comes from the image.
 */
const SCAN_CONTENT_ROOT = process.env.LEARNOS_SCAN_CONTENT_ROOT
  ? path.resolve(process.env.LEARNOS_SCAN_CONTENT_ROOT)
  : CONTENT_ROOT;

const EMPTY_COUNTS: Record<CourseScanStatus, number> = {
  new: 0,
  updated: 0,
  latest: 0,
  conflict: 0,
  scan_failed: 0,
  removed: 0,
};

function parseVersion(version: string): number[] {
  return version.split(".").map((part) => Number(part) || 0);
}

/** Compare two `major.minor.patch` versions. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return (left[index] ?? 0) < (right[index] ?? 0) ? -1 : 1;
    }
  }
  return 0;
}

function diffFiles(
  previous: Record<string, string>,
  current: Record<string, string>,
): ScannedCourse["changes"] {
  const added = Object.keys(current).filter((name) => previous[name] === undefined).sort();
  const removed = Object.keys(previous).filter((name) => current[name] === undefined).sort();
  const modified = Object.keys(current)
    .filter((name) => previous[name] !== undefined && previous[name] !== current[name])
    .sort();
  return { added, modified, removed };
}

/** Read every course directory and build snapshots without touching the database. */
export function scanLocalCourses(contentRoot = SCAN_CONTENT_ROOT): {
  courses: DeploymentCourseSnapshot[];
  failures: CourseScanFailure[];
} {
  if (!fs.existsSync(contentRoot)) {
    return { courses: [], failures: [{ slug: "(content/courses)", error: "课程目录不存在" }] };
  }

  const directories = fs
    .readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const courses: DeploymentCourseSnapshot[] = [];
  const failures: CourseScanFailure[] = [];

  for (const name of directories) {
    const directory = path.join(contentRoot, name);
    if (!fs.existsSync(path.join(directory, "course.json"))) continue;
    try {
      courses.push(buildCourseSnapshot(directory, name));
    } catch (error) {
      failures.push({
        slug: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Global IDs and validator IDs must be unique across courses. `courses:prepare`
  // enforces this during build; the scan reports it before the admin clicks deploy.
  const conceptOwners = new Map<string, string>();
  const activityOwners = new Map<string, string>();
  const validatorOwners = new Map<string, string>();
  const duplicateCourses = new Set<string>();

  for (const course of courses) {
    for (const concept of course.concepts) {
      const owner = conceptOwners.get(concept.globalId);
      if (owner) {
        failures.push({
          slug: course.slug,
          error: `概念 ID 重复: ${concept.globalId}（同时属于 ${owner}）`,
        });
        duplicateCourses.add(course.slug);
      } else {
        conceptOwners.set(concept.globalId, course.slug);
      }
    }
    for (const activity of course.activities) {
      const owner = activityOwners.get(activity.globalId);
      if (owner) {
        failures.push({
          slug: course.slug,
          error: `活动 ID 重复: ${activity.globalId}（同时属于 ${owner}）`,
        });
        duplicateCourses.add(course.slug);
      } else {
        activityOwners.set(activity.globalId, course.slug);
      }
      if (!activity.validatorId) continue;
      const validatorOwner = validatorOwners.get(activity.validatorId);
      if (validatorOwner) {
        failures.push({
          slug: course.slug,
          error: `Validator ID 重复: ${activity.validatorId}（同时属于 ${validatorOwner}）`,
        });
        duplicateCourses.add(course.slug);
      } else {
        validatorOwners.set(activity.validatorId, course.slug);
      }
    }
  }

  return {
    courses: courses.filter((course) => !duplicateCourses.has(course.slug)),
    failures,
  };
}

/** Compare local snapshots against the last successful deployment. */
export function compareScan({
  courses,
  failures,
  baseline,
  baselineVersion,
  baselineDeploymentId,
  enrollmentCounts,
}: {
  courses: DeploymentCourseSnapshot[];
  failures: CourseScanFailure[];
  baseline: DeploymentCourseSnapshot[];
  baselineVersion: string | null;
  baselineDeploymentId: string | null;
  enrollmentCounts: Map<string, number>;
}): DeploymentScan {
  const counts = { ...EMPTY_COUNTS };
  const items: ScannedCourse[] = [];
  const baselineBySlug = new Map(baseline.map((course) => [course.slug, course]));
  const currentSlugs = new Set(courses.map((course) => course.slug));

  for (const course of courses) {
    const previous = baselineBySlug.get(course.slug);
    const enrollments = enrollmentCounts.get(course.slug) ?? 0;
    const changes = diffFiles(previous?.files ?? {}, course.files);
    const messages: string[] = [];
    const warnings: string[] = [];
    let status: CourseScanStatus;

    if (!previous) {
      status = "new";
      messages.push("本地新课程，尚未部署");
      if (enrollments > 0) {
        warnings.push(`数据库中已有 ${enrollments} 条学习记录；本次同步会按结构冻结策略校验`);
      }
    } else {
      const versionDelta = compareVersions(course.version, previous.version);
      const digestChanged = course.sourceDigest !== previous.sourceDigest;
      const structureChanged = course.structuralDigest !== previous.structuralDigest;

      if (versionDelta < 0) {
        status = "conflict";
        messages.push(
          `版本回退：当前 ${course.version} 低于已部署版本 ${previous.version}`,
        );
      } else if (!digestChanged && versionDelta === 0) {
        status = "latest";
      } else {
        status = "updated";
        if (digestChanged && versionDelta === 0) {
          warnings.push(`源码已修改但 course.json 版本号仍为 ${course.version}`);
        }
        if (!digestChanged && versionDelta > 0) {
          messages.push(`仅版本号更新：${previous.version} → ${course.version}`);
        }
      }

      if (status === "updated" && structureChanged) {
        if (enrollments > 0) {
          status = "conflict";
          messages.push(
            `已有 ${enrollments} 条学习记录，章节结构/评分规则/验证器发生变化，不能原地部署；请使用新的 course slug`,
          );
        } else {
          warnings.push("章节结构或评分规则发生变化；当前没有学习记录，可原地部署");
        }
      }

      if (status === "latest" && structureChanged) {
        // The structural digest changed but source digest did not: keep the
        // explicit warning so admins can investigate a digest collision.
        warnings.push("结构摘要与已部署记录不同，请重新扫描确认");
      }
    }

    counts[status] += 1;
    items.push({
      ...course,
      status,
      enrollments,
      previousVersion: previous?.version ?? null,
      messages,
      warnings,
      changes,
    });
  }

  for (const previous of baseline) {
    if (currentSlugs.has(previous.slug)) continue;
    const enrollments = enrollmentCounts.get(previous.slug) ?? 0;
    const messages = [
      "本地已移除该课程目录；courses:sync 不会删除数据库中的课程与历史记录",
      enrollments > 0
        ? `已有 ${enrollments} 条学习记录，移除源码会导致章节内容不可读；请恢复目录或改用新 slug`
        : "请恢复目录或手动处理数据库记录后再部署，避免线上课程缺少内容",
    ];
    // Removing a deployed course always blocks: sync intentionally does not
    // delete courses, so a published row could otherwise keep pointing at
    // missing files in the new image.
    counts.removed += 1;
    items.push({
      ...previous,
      status: "removed",
      enrollments,
      previousVersion: previous.version,
      messages,
      warnings: [],
      changes: { added: [], modified: [], removed: Object.keys(previous.files).sort() },
    });
  }

  items.sort((a, b) => {
    const order: Record<CourseScanStatus, number> = {
      conflict: 0,
      scan_failed: 1,
      new: 2,
      updated: 3,
      removed: 4,
      latest: 5,
    };
    return order[a.status] - order[b.status] || a.slug.localeCompare(b.slug);
  });

  counts.scan_failed += failures.length;
  const blockingReasons: string[] = [];
  for (const failure of failures) {
    blockingReasons.push(`${failure.slug}: ${failure.error}`);
  }
  for (const item of items) {
    if (item.status === "conflict" || item.status === "removed") {
      blockingReasons.push(`${item.slug}: ${item.messages.join("；")}`);
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    baselineVersion,
    baselineDeploymentId,
    items,
    failures,
    counts,
    canDeploy: blockingReasons.length === 0,
    blockingReasons,
  };
}
