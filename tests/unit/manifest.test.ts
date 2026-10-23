import { describe, expect, it } from "vitest";

import { courseManifestSchema, quizFileSchema } from "@/lib/content/manifest";

type LessonDraft = {
  slug: string;
  title: string;
  source: string;
  required: boolean;
  blocks?: {
    id: string;
    kind: string;
    activityId?: string;
    source?: string;
    passScore?: number;
  }[];
  completion?: { mode: string; requiredBlocks: string[] };
  finalExam?: boolean;
};

function validManifest(): {
  schemaVersion: number;
  slug: string;
  title: string;
  description: string;
  version: string;
  lessons: LessonDraft[];
} {
  return {
    schemaVersion: 3,
    slug: "demo-course",
    title: "演示课程",
    description: "内容即代码",
    version: "1.0.0",
    lessons: [
      {
        slug: "intro",
        title: "导读",
        source: "intro.mdx",
        required: true,
      },
      {
        slug: "lab",
        title: "实验",
        source: "lab.mdx",
        required: true,
        blocks: [{ id: "lab-sim", kind: "simulation", activityId: "demo-course/lab" }],
        completion: { mode: "all", requiredBlocks: ["lab-sim"] },
      },
      {
        slug: "final-quiz",
        title: "最终测验",
        source: "final.mdx",
        required: true,
        finalExam: true,
        blocks: [
          { id: "final-check", kind: "question", source: "final.server.json", passScore: 70 },
        ],
        completion: { mode: "all", requiredBlocks: ["final-check"] },
      },
    ],
  };
}

describe("courseManifestSchema", () => {
  it("接受结构完整的课程", () => {
    expect(courseManifestSchema.safeParse(validManifest()).success).toBe(true);
  });

  it("最终测验是可选的，纯章节课程仍然合法", () => {
    const manifest = validManifest();
    manifest.lessons = manifest.lessons.slice(0, 2);
    expect(courseManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("拒绝多个最终测验", () => {
    const manifest = validManifest();
    manifest.lessons[1] = {
      ...manifest.lessons[1],
      finalExam: true,
      blocks: [{ id: "lab-check", kind: "question", source: "lab.server.json" }],
      completion: { mode: "all", requiredBlocks: ["lab-check"] },
    };
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("最终测验必须包含必需的知识检查", () => {
    const manifest = validManifest();
    manifest.lessons[2] = {
      ...manifest.lessons[2],
      blocks: [{ id: "final-sim", kind: "simulation", activityId: "demo-course/lab" }],
      completion: { mode: "all", requiredBlocks: ["final-sim"] },
    };
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("拒绝重复章节 slug", () => {
    const manifest = validManifest();
    manifest.lessons[1].slug = "intro";
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("拒绝没有必修章节的课程", () => {
    const manifest = validManifest();
    for (const lesson of manifest.lessons) lesson.required = false;
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("拒绝目录穿越的资源路径", () => {
    const manifest = validManifest();
    manifest.lessons[0].source = "../../etc/passwd";
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("拒绝非 MDX 章节正文", () => {
    const manifest = validManifest();
    manifest.lessons[0].source = "quiz.server.json";
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("拒绝 Manifest v2", () => {
    const manifest = validManifest() as Record<string, unknown>;
    manifest.schemaVersion = 2;
    expect(courseManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("manual 章节可以声明可选 Block", () => {
    const manifest = validManifest();
    manifest.lessons[0] = {
      ...manifest.lessons[0],
      blocks: [{ id: "practice", kind: "simulation", activityId: "demo-course/lab" }],
    };
    expect(courseManifestSchema.safeParse(manifest).success).toBe(true);
  });
});

describe("quizFileSchema", () => {
  const base = {
    passScore: 70,
    questions: [
      {
        id: "q1",
        prompt: "哪一个正确？",
        type: "single",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        answer: "b",
      },
    ],
  };

  it("接受合法题库", () => {
    expect(quizFileSchema.safeParse(base).success).toBe(true);
  });

  it("拒绝答案不在选项中的题目", () => {
    const quiz = structuredClone(base);
    quiz.questions[0].answer = "z";
    expect(quizFileSchema.safeParse(quiz).success).toBe(false);
  });

  it("拒绝对单选题给出多个答案", () => {
    const quiz = structuredClone(base);
    quiz.questions[0].answer = ["a", "b"] as never;
    expect(quizFileSchema.safeParse(quiz).success).toBe(false);
  });

  it("拒绝重复题目 id", () => {
    const quiz = structuredClone(base);
    quiz.questions.push(structuredClone(quiz.questions[0]));
    expect(quizFileSchema.safeParse(quiz).success).toBe(false);
  });
});
