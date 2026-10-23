import { describe, expect, it } from "vitest";

import { resolveChapterBlocks } from "@/lib/content/blocks";
import { loadCourse } from "@/lib/content/loader";
import { gradeQuiz, publicQuizQuestion } from "@/lib/content/quiz";
import type { QuizQuestion } from "@/lib/content/manifest";

const questions: QuizQuestion[] = [
  {
    id: "single",
    prompt: "单选",
    type: "single",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    answer: "b",
  },
  {
    id: "multiple",
    prompt: "多选",
    type: "multiple",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    answer: ["a", "c"],
  },
  {
    id: "boolean",
    prompt: "判断",
    type: "boolean",
    answer: true,
  },
];

describe("章节知识检查判分", () => {
  it("支持单选、多选和判断题", () => {
    const result = gradeQuiz(questions, {
      single: "b",
      multiple: ["c", "a"],
      boolean: "true",
    });
    expect(result.correct).toBe(3);
    expect(result.score).toBe(100);
    expect(result.results.every((item) => item.correct)).toBe(true);
  });

  it("多选题必须集合完全一致", () => {
    const result = gradeQuiz(questions, {
      single: "b",
      multiple: ["a", "c", "b"],
      boolean: "true",
    });
    expect(result.correct).toBe(2);
    expect(result.results.find((item) => item.questionId === "multiple")?.correct).toBe(false);
  });

  it("判断题使用 true/false 字符串提交", () => {
    const result = gradeQuiz([questions[2]], { boolean: "false" });
    expect(result.correct).toBe(0);
    expect(result.results[0].correct).toBe(false);
  });

  it("章节公开 Block 数据不包含答案或解析", () => {
    const course = loadCourse("http-from-zero");
    const lesson = course.manifest.lessons.find(
      (item) => item.type === "article" && item.slug === "http-methods",
    );
    if (!lesson || lesson.type !== "article") throw new Error("missing lesson");
    const resolved = resolveChapterBlocks(course, lesson);
    const json = JSON.stringify(resolved);
    expect(json).not.toContain("\"answer\"");
    expect(json).not.toContain("\"explanation\"");
    expect(json).not.toContain("POST 通常用于在集合下创建资源");
  });

  it("公开题目把判断题转成两项选择且不包含答案", () => {
    const publicQuestion = publicQuizQuestion(questions[2]);
    expect(publicQuestion.type).toBe("single");
    expect(publicQuestion.options.map((option) => option.id)).toEqual(["true", "false"]);
    expect(JSON.stringify(publicQuestion)).not.toContain("answer");
    expect(JSON.stringify(publicQuestion)).not.toContain("explanation");
  });
});
