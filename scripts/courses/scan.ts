import fs from "node:fs";
import path from "node:path";

import { scanLocalCourses } from "@/lib/deployments/scan";

const root = process.cwd();
const { courses, failures } = scanLocalCourses();

const payload = {
  generatedAt: new Date().toISOString(),
  courses: courses.map((course) => ({
    slug: course.slug,
    title: course.title,
    courseVersion: course.version,
    sourceDigest: course.sourceDigest,
    structuralDigest: course.structuralDigest,
    files: Object.keys(course.files).length,
    lessons: course.lessons.length,
    concepts: course.concepts.length,
    activities: course.activities.length,
  })),
  failures,
};

const json = JSON.stringify(payload, null, 2);
if (process.argv.includes("--out")) {
  fs.writeFileSync(path.join(root, ".course-scan.json"), `${json}\n`);
  console.error(`[courses:scan] 写入 ${path.join(root, ".course-scan.json")}`);
}
console.log(json);
process.exit(failures.length === 0 ? 0 : 1);
