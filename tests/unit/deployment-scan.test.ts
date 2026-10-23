import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildCourseSnapshot } from "@/lib/deployments/course-snapshot";
import { compareScan } from "@/lib/deployments/scan";

const repoRoot = process.cwd();
const sourceCourse = path.join(repoRoot, "content/courses/sql-injection-basics");
const temporary: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "learnos-scan-"));
  temporary.push(dir);
  return dir;
}

function copyCourse(): string {
  const target = path.join(tempDir(), "sql-injection-basics");
  fs.cpSync(sourceCourse, target, { recursive: true });
  return target;
}

function compare(
  baseline: ReturnType<typeof buildCourseSnapshot>,
  current: ReturnType<typeof buildCourseSnapshot>,
  enrollments = 0,
) {
  return compareScan({
    courses: [current],
    failures: [],
    baseline: [baseline],
    baselineVersion: "2026.10.22-01",
    baselineDeploymentId: "baseline",
    enrollmentCounts: new Map([[current.slug, enrollments]]),
  });
}

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("课程部署扫描", () => {
  it("源码未变化时标记为已是最新", () => {
    const dir = copyCourse();
    const baseline = buildCourseSnapshot(dir, "sql-injection-basics");
    const current = buildCourseSnapshot(dir, "sql-injection-basics");
    const scan = compare(baseline, current);
    expect(scan.items[0].status).toBe("latest");
    expect(scan.counts.latest).toBe(1);
    expect(scan.canDeploy).toBe(true);
  });

  it("版本号未递增但 MDX 发生变化时仍识别并提示", () => {
    const dir = copyCourse();
    const baseline = buildCourseSnapshot(dir, "sql-injection-basics");
    const mdx = path.join(dir, "01-where-injection-comes-from.mdx");
    fs.appendFileSync(mdx, "\n\n新增一段说明。\n");
    const current = buildCourseSnapshot(dir, "sql-injection-basics");

    const scan = compare(baseline, current);
    expect(scan.items[0].status).toBe("updated");
    expect(scan.items[0].warnings.join("；")).toContain("版本号");
    expect(scan.items[0].changes.modified).toContain("01-where-injection-comes-from.mdx");
    expect(scan.items[0].structuralDigest).toBe(baseline.structuralDigest);
  });

  it("已有学习记录时评分规则变化被识别为版本冲突", () => {
    const dir = copyCourse();
    const baseline = buildCourseSnapshot(dir, "sql-injection-basics");
    const quizPath = path.join(dir, "quiz.server.json");
    const quiz = JSON.parse(fs.readFileSync(quizPath, "utf8"));
    quiz.passScore = 80;
    fs.writeFileSync(quizPath, JSON.stringify(quiz, null, 2));
    const current = buildCourseSnapshot(dir, "sql-injection-basics");

    const scan = compare(baseline, current, 1);
    expect(scan.items[0].status).toBe("conflict");
    expect(scan.items[0].messages.join("；")).toContain("新的 course slug");
    expect(scan.canDeploy).toBe(false);
  });

  it("无学习记录的结构变化允许部署但提示", () => {
    const dir = copyCourse();
    const baseline = buildCourseSnapshot(dir, "sql-injection-basics");
    const quizPath = path.join(dir, "quiz.server.json");
    const quiz = JSON.parse(fs.readFileSync(quizPath, "utf8"));
    quiz.passScore = 80;
    fs.writeFileSync(quizPath, JSON.stringify(quiz, null, 2));
    const current = buildCourseSnapshot(dir, "sql-injection-basics");

    const scan = compare(baseline, current, 0);
    expect(scan.items[0].status).toBe("updated");
    expect(scan.items[0].warnings.join("；")).toContain("没有学习记录");
    expect(scan.canDeploy).toBe(true);
  });

  it("新课程目录不需要改动核心 Registry", () => {
    const root = tempDir();
    const contentRoot = path.join(root, "content/courses");
    const dir = path.join(contentRoot, "brand-new-course");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "course.json"),
      JSON.stringify(
        {
          schemaVersion: 2,
          slug: "brand-new-course",
          title: "新课程",
          description: "",
          version: "1.0.0",
          lessons: [
            {
              slug: "intro",
              title: "介绍",
              type: "article",
              source: "intro.mdx",
              completionPolicy: "manual",
              required: true,
            },
            {
              slug: "final-quiz",
              title: "最终测验",
              type: "quiz",
              source: "quiz.server.json",
              completionPolicy: "server_validated",
              required: true,
              finalExam: true,
            },
          ],
          plugins: { concepts: [], activities: [] },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(dir, "intro.mdx"), "# 新课程\n");
    fs.writeFileSync(
      path.join(dir, "quiz.server.json"),
      JSON.stringify({
        passScore: 70,
        questions: [
          {
            id: "q1",
            prompt: "1+1?",
            type: "single",
            options: [
              { id: "a", label: "2" },
              { id: "b", label: "3" },
            ],
            answer: "a",
          },
        ],
      }),
    );

    const snapshot = buildCourseSnapshot(dir, "brand-new-course");
    expect(snapshot.slug).toBe("brand-new-course");
    expect(snapshot.lessons).toHaveLength(2);
    expect(snapshot.lessons[1].quizHash).toMatch(/^[a-f0-9]{64}$/);

    const scan = compareScan({
      courses: [snapshot],
      failures: [],
      baseline: [],
      baselineVersion: null,
      baselineDeploymentId: null,
      enrollmentCounts: new Map(),
    });
    expect(scan.items[0].status).toBe("new");
    expect(scan.canDeploy).toBe(true);
  });

  it("新增不影响完成条件的可选 Block 不改变结构摘要", () => {
    const root = tempDir();
    const target = path.join(root, "http-from-zero");
    fs.cpSync(path.join(repoRoot, "content/courses/http-from-zero"), target, { recursive: true });
    const baseline = buildCourseSnapshot(target, "http-from-zero");

    const manifestPath = path.join(target, "course.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const chapter = manifest.lessons.find(
      (lesson: { slug: string }) => lesson.slug === "request-response",
    );
    chapter.blocks.push({
      id: "optional-check",
      kind: "question",
      source: "assessments/status-check.server.json",
    });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.appendFileSync(
      path.join(target, "lessons/04-request-response.mdx"),
      "\n\n<KnowledgeCheck blockId=\"optional-check\" />\n",
    );

    const changed = buildCourseSnapshot(target, "http-from-zero");
    expect(changed.sourceDigest).not.toBe(baseline.sourceDigest);
    expect(changed.structuralDigest).toBe(baseline.structuralDigest);
  });

  it("移除已部署课程会阻止部署，避免线上记录指向缺失内容", () => {
    const dir = copyCourse();
    const baseline = buildCourseSnapshot(dir, "sql-injection-basics");
    const scan = compareScan({
      courses: [],
      failures: [],
      baseline: [baseline],
      baselineVersion: "2026.10.22-01",
      baselineDeploymentId: "baseline",
      enrollmentCounts: new Map(),
    });
    expect(scan.items[0].status).toBe("removed");
    expect(scan.counts.removed).toBe(1);
    expect(scan.canDeploy).toBe(false);
  });

  it("扫描失败会阻止部署", () => {
    const root = tempDir();
    const contentRoot = path.join(root, "content/courses");
    const dir = path.join(contentRoot, "broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "course.json"), "{not json");

    const scan = compareScan({
      courses: [],
      failures: [{ slug: "broken", error: "course.json 不是合法 JSON" }],
      baseline: [],
      baselineVersion: null,
      baselineDeploymentId: null,
      enrollmentCounts: new Map(),
    });
    expect(scan.canDeploy).toBe(false);
    expect(scan.counts.scan_failed).toBe(1);
    expect(scan.blockingReasons[0]).toContain("broken");
  });
});
