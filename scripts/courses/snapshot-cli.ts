import fs from "node:fs";
import path from "node:path";

import { scanLocalCourses } from "@/lib/deployments/scan";

const outIndex = process.argv.indexOf("--out");
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : null;

const { courses, failures } = scanLocalCourses();
const payload = {
  generatedAt: new Date().toISOString(),
  contentRoot: process.env.LEARNOS_CONTENT_ROOT ?? "content/courses",
  courses,
  failures,
};
const json = `${JSON.stringify(payload, null, 2)}\n`;

if (outFile) {
  const target = path.resolve(outFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, json);
  console.error(
    `[courses:snapshot] ${courses.length} 门课程，${failures.length} 个失败 → ${target}`,
  );
} else {
  process.stdout.write(json);
}

for (const failure of failures) {
  console.error(`✗ ${failure.slug}: ${failure.error}`);
}

process.exit(failures.length === 0 ? 0 : 1);
