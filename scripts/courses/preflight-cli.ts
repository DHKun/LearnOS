import "../env";

import { loadAllCourses } from "@/lib/content/loader";
import { createAdminClient } from "@/lib/supabase/admin";

import { structureMatches, type DbLesson } from "./sync";

/**
 * Read-only compatibility gate. `courses:sync` performs the same checks while
 * writing, but the updater runs this first so a failed deployment can stop
 * before any database mutation or container replacement.
 */
async function main() {
  const db = createAdminClient();
  const courses = await loadAllCourses();
  const failures: string[] = [];

  for (const loaded of courses) {
    const { manifest } = loaded;
    const { data: existingCourse, error: courseError } = await db
      .from("courses")
      .select("id")
      .eq("slug", manifest.slug)
      .maybeSingle();
    if (courseError) throw courseError;

    if (!existingCourse) {
      console.log(`＋ ${manifest.slug}: 新课程，可安装`);
      continue;
    }

    const { count, error: countError } = await db
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", existingCourse.id);
    if (countError) throw countError;
    const enrollments = count ?? 0;

    if (enrollments === 0) {
      console.log(`↻ ${manifest.slug}: 无学习记录，可原地更新`);
      continue;
    }

    const { data: lessons, error: lessonsError } = await db
      .from("lessons")
      .select("id,slug,position,required,type,completion_policy,config")
      .eq("course_id", existingCourse.id);
    if (lessonsError) throw lessonsError;

    if (!structureMatches(loaded, (lessons ?? []) as DbLesson[])) {
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
