import { describe, expect, it } from "vitest";

import { courseManifestSchema, quizFileSchema } from "@/lib/content/manifest";

function manifest(lessons: unknown[]) {
  return {
    schemaVersion: 3,
    slug: "http-demo",
    title: "HTTP 演示",
    description: "",
    version: "1.0.0",
    lessons,
  };
}

const finalQuiz = {
  slug: "final-quiz",
  title: "最终测验",
  type: "quiz",
  source: "assessments/final.server.json",
  completionPolicy: "server_validated",
  required: true,
  finalExam: true,
};

const article = {
  slug: "chapter-one",
  title: "第一章",
  type: "article",
  source: "lessons/one.mdx",
  required: true,
  completionPolicy: "manual",
};

describe("Manifest v3 混合章节", () => {
  it("纯文字课程 / 纯文字章节合法，plugins 可省略", () => {
    const parsed = courseManifestSchema.safeParse(manifest([article, finalQuiz]));
    expect(parsed.success).toBe(true);
  });

  it("v2 纯文字课程继续合法", () => {
    const parsed = courseManifestSchema.safeParse({
      schemaVersion: 2,
      slug: "legacy-demo",
      title: "旧课程",
      version: "1.0.0",
      lessons: [article, finalQuiz],
    });
    expect(parsed.success).toBe(true);
  });

  it("模拟实验 Block + all 完成规则合法", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          completionPolicy: "server_validated",
          blocks: [{ id: "request-lab", kind: "simulation", activityId: "http-demo/request" }],
          completion: { mode: "all", requiredBlocks: ["request-lab"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("章节知识检查 Block + any 完成规则合法", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          completionPolicy: "server_validated",
          blocks: [
            { id: "check-a", kind: "question", source: "assessments/a.json", passScore: 60 },
            { id: "check-b", kind: "question", source: "assessments/b.json" },
          ],
          completion: { mode: "any", requiredBlocks: ["check-a", "check-b"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("manual 章节可以声明可选 Block", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          blocks: [{ id: "practice", kind: "simulation", activityId: "http-demo/request" }],
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("server_validated + blocks 省略 completion 时接受（隐式 all）", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          completionPolicy: "server_validated",
          blocks: [{ id: "lab", kind: "simulation", activityId: "http-demo/request" }],
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("v2 不允许 blocks", () => {
    const parsed = courseManifestSchema.safeParse({
      schemaVersion: 2,
      slug: "legacy-demo",
      title: "旧课程",
      version: "1.0.0",
      lessons: [
        {
          ...article,
          blocks: [{ id: "lab", kind: "simulation", activityId: "x" }],
        },
        finalQuiz,
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("requiredBlock 不存在时拒绝", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          completionPolicy: "server_validated",
          blocks: [{ id: "lab", kind: "simulation", activityId: "x" }],
          completion: { mode: "all", requiredBlocks: ["missing"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("all/any 不能配合 manual completionPolicy", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          blocks: [{ id: "lab", kind: "simulation", activityId: "x" }],
          completion: { mode: "all", requiredBlocks: ["lab"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("manual 完成模式不能声明 requiredBlocks", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          blocks: [{ id: "lab", kind: "simulation", activityId: "x" }],
          completion: { mode: "manual", requiredBlocks: ["lab"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("Block ID 重复时拒绝", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...article,
          completionPolicy: "server_validated",
          blocks: [
            { id: "lab", kind: "simulation", activityId: "x" },
            { id: "lab", kind: "question", source: "assessments/a.json" },
          ],
          completion: { mode: "all", requiredBlocks: ["lab"] },
        },
        finalQuiz,
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("server_validated 章节没有任何 Block 时拒绝", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([{ ...article, completionPolicy: "server_validated" }, finalQuiz]),
    );
    expect(parsed.success).toBe(false);
  });

  it("判断题使用 boolean 答案", () => {
    const parsed = quizFileSchema.safeParse({
      passScore: 60,
      questions: [
        {
          id: "tf",
          prompt: "GET 是安全方法。",
          type: "boolean",
          answer: true,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
