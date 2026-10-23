import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("单站点原生互动架构", () => {
  it("不再包含独立 Labs 站点或 iframe bridge", () => {
    expect(fs.existsSync(path.join(root, "apps/labs"))).toBe(false);
    expect(fs.existsSync(path.join(root, "packages/learning-sdk"))).toBe(false);
    expect(fs.existsSync(path.join(root, "lib/learning/bridge.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "components/learning/lab-frame.tsx"))).toBe(false);
  });

  it("所有章节使用统一的正文渲染结构，不再渲染 iframe", () => {
    const page = read("app/(student)/learn/[courseId]/page.tsx");
    expect(page).toContain("ChapterLearningProvider");
    expect(page).toContain("ArticleView");
    expect(page).not.toContain("ActivityHost");
    expect(page).not.toContain("QuizPlayer");
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain("LabFrame");
    expect(page).not.toContain("frameLocator");
  });

  it("模拟实验 Block 使用课程命名空间的 activityId 并已注册组件", () => {
    const manifest = read("content/courses/sql-injection-basics/course.json");
    const idempotency = read("content/courses/idempotent-retries/course.json");
    const registry = read("lib/generated/course-components.tsx");
    expect(manifest).toContain('"activityId": "sql-injection-basics/sql-injection-lab"');
    expect(idempotency).toContain('"activityId": "idempotent-retries/idempotency-lab"');
    expect(manifest).not.toContain("legacyGlobalId");
    expect(idempotency).not.toContain("legacyGlobalId");
    expect(manifest).not.toContain("entryUrl");
    expect(idempotency).not.toContain("entryUrl");
    expect(registry).toContain("sql-injection-basics/sql-injection-lab");
    expect(registry).toContain("idempotent-retries/idempotency-lab");
    expect(read("components/activities/registry.tsx")).toContain("ACTIVITY_COMPONENTS");
  });
});
