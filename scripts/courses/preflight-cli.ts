import "../env";

import { loadAllCourses } from "@/lib/content/loader";
import { one, query } from "../db";

import { structureMatches, type DbLesson } from "./sync";

/**
 * Read-only compatibility gate. `courses:sync` performs the same checks while
 * writing, but the updater runs this first so a failed deployment can stop
 * before any database mutation or container replacement.
 */
async function main() {
  const courses = await loadAllCourses();
  const failures: string[] = [];

  for (const loaded of courses) {
    const { manifest } = loaded;
    const existingCourse = await one<{ id: string }>(
      "select id from public.courses where slug=$1 limit 1",
      [manifest.slug],
    );

    if (!existingCourse) {
      console.log(`＋ ${manifest.slug}: 新课程，可安装`);
      continue;
    }

    const countRow = await one<{ count: string }>(
      "select count(*)::text as count from public.enrollments where course_id=$1",
      [existingCourse.id],
    );
    const enrollments = Number(countRow?.count ?? 0);

    if (enrollments === 0) {
      console.log(`↻ ${manifest.slug}: 无学习记录，可原地更新`);
      continue;
    }

    const lessons = await query<DbLesson>(
      `select id,slug,position,required,type,completion_policy,config
         from public.lessons where course_id=$1`,
      [existingCourse.id],
    );

    if (!structureMatches(loaded, lessons)) {
      failures.push(
        `${manifest.slug}: 已有 ${enrollments} 条学习记录，章节结构/评分规则/题库/验证器发生变化，不能原地同步；请使用新的 course slug`,
      );
    } else {
      console.log(`✓ ${manifest.slug}: ${enrollments} 条学习记录，结构兼容`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`✗ ${failure}`);
    console.error(`\n兼容性检查失败：${failures.length} 门课程。`);
    process.exit(1);
  }

  console.log(`\n兼容性检查通过：${courses.length} 门课程。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
