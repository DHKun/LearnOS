import "../env";

import { syncCourses } from "./sync";

async function main() {
  const publish = process.argv.includes("--publish");
  const summaries = await syncCourses({ publish });
  for (const summary of summaries) {
    console.log(
      `${summary.created ? "＋" : "↻"} ${summary.slug} → ${summary.courseId} (${summary.lessonCount} 章节, ${summary.enrollments} 条学习记录)`,
    );
  }
  console.log(
    publish
      ? "\n课程已同步并发布。"
      : "\n课程已同步；发布状态保持不变（可在 /admin/courses 发布）。",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
