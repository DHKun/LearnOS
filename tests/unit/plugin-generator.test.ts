import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const generator = path.join(repoRoot, "scripts", "courses", "generate.ts");
const sourceCourse = path.join(repoRoot, "content", "courses", "sql-injection-basics");
const temporary: string[] = [];

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learnos-generate-"));
  temporary.push(dir);
  return dir;
}

function runGenerator(root: string): { ok: boolean; stderr: string } {
  try {
    execFileSync(tsxBin, [generator], {
      cwd: repoRoot,
      env: { ...process.env, LEARNOS_PROJECT_ROOT: root },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { ok: true, stderr: "" };
  } catch (error) {
    const detail =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr: unknown }).stderr)
        : String(error);
    return { ok: false, stderr: detail };
  }
}

function writeMinimalCourse(
  root: string,
  slug: string,
  activities: { id: string }[],
): void {
  const dir = path.join(root, "content/courses", slug);
  fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "validators.ts"),
    "export function validate() { return { passed: true, feedback: {} }; }\n",
  );
  fs.writeFileSync(
    path.join(dir, "course.json"),
    JSON.stringify(
      {
        schemaVersion: 3,
        slug,
        title: slug,
        description: "",
        version: "1.0.0",
        lessons: [],
        plugins: {
          concepts: [],
          activities: activities.map((activity) => {
            fs.writeFileSync(
              path.join(dir, "activities", `${activity.id}.tsx`),
              `export function Activity${activity.id.replace(/[^a-zA-Z0-9]/g, "")}() { return null; }\n`,
            );
            return {
              id: activity.id,
              component: `activities/${activity.id}.tsx`,
              export: `Activity${activity.id.replace(/[^a-zA-Z0-9]/g, "")}`,
              validator: {
                path: "validators.ts",
                export: "validate",
              },
            };
          }),
        },
      },
      null,
      2,
    ),
  );
}

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("课程插件生成器", () => {
  it("复制一个新课程目录即自动进入 registry", () => {
    const root = tempRoot();
    const target = path.join(root, "content/courses/new-course");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(sourceCourse, target, { recursive: true });

    const manifestPath = path.join(target, "course.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.slug = "new-course";
    manifest.title = "新复制的课程";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runGenerator(root);
    expect(result.ok, result.stderr).toBe(true);

    const catalog = fs.readFileSync(path.join(root, "lib/generated/course-catalog.ts"), "utf8");
    const components = fs.readFileSync(
      path.join(root, "lib/generated/course-components.tsx"),
      "utf8",
    );
    expect(catalog).toContain('"new-course/sql-injection-lab"');
    expect(catalog).toContain('"new-course/data-vs-instruction"');
    expect(components).toContain("content/courses/new-course/activities/sql-injection");

    const validators = fs.readFileSync(
      path.join(root, "lib/generated/validator-registry.server.ts"),
      "utf8",
    );
    expect(validators).toContain("new-course/sql-injection-lab");
  });

  it("纯文字课程可以没有 plugins 声明", () => {
    const root = tempRoot();
    const dir = path.join(root, "content/courses/plain-text");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "course.json"),
      JSON.stringify(
        {
          schemaVersion: 3,
          slug: "plain-text",
          title: "纯文字课程",
          description: "",
          version: "1.0.0",
          lessons: [],
        },
        null,
        2,
      ),
    );
    const result = runGenerator(root);
    expect(result.ok, result.stderr).toBe(true);
    const catalog = fs.readFileSync(path.join(root, "lib/generated/course-catalog.ts"), "utf8");
    expect(catalog).not.toContain("plain-text/");
  });

  it("验证器 ID 使用课程命名空间，不同课程的同名活动不会冲突", () => {
    const root = tempRoot();
    writeMinimalCourse(root, "course-a", [{ id: "lab" }]);
    writeMinimalCourse(root, "course-b", [{ id: "lab" }]);

    const result = runGenerator(root);
    expect(result.ok, result.stderr).toBe(true);
    const catalog = fs.readFileSync(path.join(root, "lib/generated/course-catalog.ts"), "utf8");
    expect(catalog).toContain('"course-a/lab"');
    expect(catalog).toContain('"course-b/lab"');
  });

  it("拒绝客户端组件导入服务端答案/验证器", () => {
    const root = tempRoot();
    const dir = path.join(root, "content/courses/leaky-client");
    fs.mkdirSync(path.join(dir, "activities"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "validators.ts"),
      "export function validate() { return { passed: true, feedback: {} }; }\n",
    );
    fs.writeFileSync(
      path.join(dir, "activities/leaky.tsx"),
      'import { validate } from "../validators";\nexport function Leaky() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(dir, "course.json"),
      JSON.stringify(
        {
          schemaVersion: 3,
          slug: "leaky-client",
          title: "泄漏客户端",
          description: "",
          version: "1.0.0",
          lessons: [],
          plugins: {
            concepts: [],
            activities: [
              {
                id: "leaky",
                component: "activities/leaky.tsx",
                export: "Leaky",
                validator: { path: "validators.ts", export: "validate" },
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const result = runGenerator(root);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("不能导入服务端验证器或答案文件");
  });

  it("拒绝指向课程目录外的符号链接", () => {
    const root = tempRoot();
    const dir = path.join(root, "content/courses/symlink-course");
    fs.mkdirSync(path.join(dir, "components"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "outside.tsx"),
      "export function Outside() { return null; }\n",
    );
    fs.symlinkSync(path.join(root, "outside.tsx"), path.join(dir, "components/link.tsx"));
    fs.writeFileSync(
      path.join(dir, "course.json"),
      JSON.stringify(
        {
          schemaVersion: 3,
          slug: "symlink-course",
          title: "符号链接课程",
          description: "",
          version: "1.0.0",
          lessons: [],
          plugins: {
            concepts: [
              {
                id: "escape",
                component: "components/link.tsx",
                export: "Outside",
                title: "逃逸",
                analogy: "不应通过",
              },
            ],
            activities: [],
          },
        },
        null,
        2,
      ),
    );

    const result = runGenerator(root);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("路径越出课程目录");
  });
});
