import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const coursesDir = path.join(root, "content/courses");

function digestCourse(dir: string) {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(dir);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(dir, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: files.length };
}

const items = fs
  .readdirSync(coursesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(coursesDir, entry.name))
  .filter((dir) => fs.existsSync(path.join(dir, "course.json")))
  .map((dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "course.json"), "utf8")) as {
      slug: string;
      version: string;
      title: string;
    };
    const { digest, files } = digestCourse(dir);
    return {
      slug: manifest.slug,
      title: manifest.title,
      courseVersion: manifest.version,
      sourceDigest: digest,
      files,
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

const payload = {
  commit: process.env.GIT_COMMIT ?? null,
  generatedAt: new Date().toISOString(),
  courses: items,
};

const json = JSON.stringify(payload, null, 2);
if (process.argv.includes("--out")) {
  fs.writeFileSync(path.join(root, ".course-scan.json"), json + "\n");
}
console.log(json);
