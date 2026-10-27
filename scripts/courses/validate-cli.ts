import "../env";

import { validateAllCourses } from "@/lib/content/loader";
import { validateAllPaths } from "@/lib/content/paths";

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

  const paths = validateAllPaths();
  let pathsFailed = 0;
  for (const result of paths) {
    if (result.ok) {
      console.log(`✓ 路线 ${result.slug}`);
    } else {
      pathsFailed += 1;
      console.error(`✗ 路线 ${result.slug}: ${result.error}`);
    }
  }
  if (paths.length) console.log(`${paths.length - pathsFailed}/${paths.length} 条学习路线通过校验。`);
  process.exit(failed === 0 && pathsFailed === 0 ? 0 : 1);
}

void main();
