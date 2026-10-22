import { describe, expect, it } from "vitest";

import { courseManifestSchema, quizFileSchema } from "@/lib/content/manifest";

function validManifest() {
  return {
    slug: "demo-course",
    title: "演示课程",
    description: "内容即代码",
    version: "1.0.0",
    lessons: [
      {
        slug: "intro",
        title: "导读",
        type: "article",
        source: "intro.mdx",
        completionPolicy: "manual",
        required: true,
      },
      {
        slug: "lab",
        title: "实验",
        type: "interactive",
        entryUrl: "http://localhost:4310/demo/",
        completionPolicy: "server_validated",
        validatorId: "demo-validator",
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
  };
}

describe("courseManifestSchema", () => {
  it("接受结构完整的课程", () => {
    const parsed = courseManifestSchema.safeParse(validManifest());
    expect(parsed.success).toBe(true);
  });

  it("拒绝没有最终测验的课程", () => {
    const manifest = validManifest();
    manifest.lessons[2] = { ...manifest.lessons[2], finalExam: false } as never;
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("拒绝最终测验不在最后的课程", () => {
    const manifest = validManifest();
    const last = manifest.lessons.pop()!;
    manifest.lessons.unshift(last);
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("拒绝重复章节 slug", () => {
    const manifest = validManifest();
    manifest.lessons[1].slug = "intro";
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("拒绝没有必修章节的课程", () => {
    const manifest = validManifest();
    for (const lesson of manifest.lessons) lesson.required = false;
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("拒绝目录穿越的资源路径", () => {
    const manifest = validManifest();
    manifest.lessons[0].source = "../../etc/passwd";
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
  });

  it("拒绝图文章节使用 server_validated", () => {
    const manifest = validManifest();
    manifest.lessons[0].completionPolicy = "server_validated";
    const parsed = courseManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
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
