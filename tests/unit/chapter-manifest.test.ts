import { describe, expect, it } from "vitest";

import { courseManifestSchema } from "@/lib/content/manifest";

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

const chapter = {
  slug: "chapter-one",
  title: "第一章",
  source: "lessons/one.mdx",
  required: true,
};

describe("Manifest v3 统一章节模型", () => {
  it("纯文字课程 / 纯文字章节合法，plugins 可省略", () => {
    expect(courseManifestSchema.safeParse(manifest([chapter])).success).toBe(true);
  });

  it("v2 schemaVersion 被拒绝", () => {
    const parsed = courseManifestSchema.safeParse({
      ...manifest([chapter]),
      schemaVersion: 2,
    });
    expect(parsed.success).toBe(false);
  });

  it("模拟实验 Block + all 完成规则合法", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [{ id: "request-lab", kind: "simulation", activityId: "http-demo/request" }],
          completion: { mode: "all", requiredBlocks: ["request-lab"] },
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("章节知识检查 Block + any 完成规则合法", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [
            { id: "check-a", kind: "question", source: "assessments/a.json", passScore: 60 },
            { id: "check-b", kind: "question", source: "assessments/b.json" },
          ],
          completion: { mode: "any", requiredBlocks: ["check-a", "check-b"] },
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("manual 章节可以声明可选 Block", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [{ id: "practice", kind: "simulation", activityId: "http-demo/request" }],
        },
      ]),
    );
    expect(parsed.success).toBe(true);
  });

  it("requiredBlock 不存在时拒绝", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [{ id: "lab", kind: "simulation", activityId: "http-demo/request" }],
          completion: { mode: "all", requiredBlocks: ["missing"] },
        },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("all/any 完成模式至少需要一个 requiredBlock", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [{ id: "lab", kind: "simulation", activityId: "http-demo/request" }],
          completion: { mode: "all", requiredBlocks: [] },
        },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("manual 完成模式不能声明 requiredBlocks", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [{ id: "lab", kind: "simulation", activityId: "http-demo/request" }],
          completion: { mode: "manual", requiredBlocks: ["lab"] },
        },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("Block ID 重复时拒绝", () => {
    const parsed = courseManifestSchema.safeParse(
      manifest([
        {
          ...chapter,
          blocks: [
            { id: "lab", kind: "simulation", activityId: "http-demo/request" },
            { id: "lab", kind: "question", source: "assessments/a.json" },
          ],
          completion: { mode: "all", requiredBlocks: ["lab"] },
        },
      ]),
    );
    expect(parsed.success).toBe(false);
  });

  it("最终测验不是必需的，但最多一个", () => {
    const withFinal = {
      ...chapter,
      slug: "final",
      finalExam: true,
      blocks: [{ id: "final-check", kind: "question", source: "assessments/final.json" }],
      completion: { mode: "all", requiredBlocks: ["final-check"] },
    };
    expect(courseManifestSchema.safeParse(manifest([chapter])).success).toBe(true);
    expect(courseManifestSchema.safeParse(manifest([chapter, withFinal])).success).toBe(true);
    expect(
      courseManifestSchema.safeParse(
        manifest([withFinal, { ...withFinal, slug: "final-two" }]),
      ).success,
    ).toBe(false);
  });
});
