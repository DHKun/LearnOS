import "../env";

import { validateAllCourses } from "@/lib/content/loader";

async function main() {
  const results = await validateAllCourses();

  if (results.length === 0) {
    console.error("没有找到任何课程。请检查 content/courses/*/course.json");
    process.exit(1);
  }

  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`✓ ${result.slug}`);
    } else {
      failed += 1;
      console.error(`✗ ${result.slug}: ${result.error}`);
    }
  }

  console.log(`\n${results.length - failed}/${results.length} 门课程通过校验。`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
