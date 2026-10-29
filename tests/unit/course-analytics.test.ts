import { describe, expect, it } from "vitest";

import type { QuizQuestion } from "@/lib/content/manifest";
import { gradeQuiz } from "@/lib/content/quiz";
import { buildCourseAnalytics, type AnalyticsInput } from "@/lib/services/analytics";

const NOW = new Date("2026-10-29T12:00:00Z");
const RECENT = "2026-10-28T12:00:00Z";
const OLD = "2026-10-01T12:00:00Z";

const questions: QuizQuestion[] = [
  {
    id: "q1",
    type: "single",
    prompt: "201 之后看哪里？",
    options: [
      { id: "a", label: "状态码" },
      { id: "b", label: "Location 头" },
      { id: "c", label: "Host 头" },
    ],
    answer: "b",
  },
  {
    id: "q2",
    type: "multiple",
    prompt: "哪些是幂等方法？",
    options: [
      { id: "get", label: "GET" },
      { id: "put", label: "PUT" },
      { id: "post", label: "POST" },
    ],
    answer: ["get", "put"],
  },
  { id: "q3", type: "boolean", prompt: "Cookie 由服务器保存。", answer: false },
];

function baseInput(overrides: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    course: { id: "c", slug: "demo", title: "演示课" },
    lessons: [
      { id: "l2", slug: "lab", title: "第二章", position: 1, required: true, config: {
        blocks: [
          { id: "lab", kind: "simulation", title: "修好请求" },
          { id: "check", kind: "question", title: "小测" },
        ],
      } },
      { id: "l1", slug: "intro", title: "第一章", position: 0, required: true, config: {} },
      { id: "l3", slug: "extra", title: "选读", position: 2, required: false, config: null },
    ],
    enrollments: [
      { id: "e1", status: "active", started_at: OLD, last_interaction_at: RECENT },
      { id: "e2", status: "active", started_at: OLD, last_interaction_at: OLD },
      { id: "e3", status: "completed", started_at: OLD, last_interaction_at: RECENT },
      { id: "e4", status: "active", started_at: OLD, last_interaction_at: null },
    ],
    progress: [
      { enrollment_id: "e1", lesson_id: "l1", status: "completed" },
      { enrollment_id: "e1", lesson_id: "l2", status: "in_progress" },
      { enrollment_id: "e2", lesson_id: "l1", status: "completed" },
      { enrollment_id: "e2", lesson_id: "l2", status: "in_progress" },
      { enrollment_id: "e3", lesson_id: "l1", status: "completed" },
      { enrollment_id: "e3", lesson_id: "l2", status: "completed" },
      { enrollment_id: "e4", lesson_id: "l1", status: "not_started" },
    ],
    blockLearners: [
      { lesson_id: "l2", block_id: "lab", attempts: 4, attempts_to_pass: 0, passed: false },
      { lesson_id: "l2", block_id: "lab", attempts: 1, attempts_to_pass: 0, passed: false },
      { lesson_id: "l2", block_id: "lab", attempts: 5, attempts_to_pass: 3, passed: true },
      { lesson_id: "l2", block_id: "check", attempts: 1, attempts_to_pass: 1, passed: true },
    ],
    answers: [
      { lesson_id: "l2", block_id: "check", question_id: "q1", correct: true, given: null, count: 1 },
      { lesson_id: "l2", block_id: "check", question_id: "q1", correct: false, given: "a", count: 3 },
      { lesson_id: "l2", block_id: "check", question_id: "q1", correct: false, given: "c", count: 1 },
      { lesson_id: "l2", block_id: "check", question_id: "q1", correct: false, given: null, count: 1 },
      { lesson_id: "l2", block_id: "check", question_id: "q2", correct: true, given: null, count: 4 },
      { lesson_id: "l2", block_id: "check", question_id: "q2", correct: false, given: "get,post", count: 1 },
      { lesson_id: "l2", block_id: "check", question_id: "q3", correct: true, given: null, count: 5 },
    ],
    banks: new Map([["lab::check", questions]]),
    now: NOW,
    ...overrides,
  };
}

describe("课程卡点分析", () => {
  it("章节按位置排序，统计进入、完成和停在每章的在学学员", () => {
    const result = buildCourseAnalytics(baseInput());
    expect(result.learners).toEqual({ total: 4, active: 3, completed: 1, abandoned: 0 });
    expect(result.lessons.map((lesson) => lesson.id)).toEqual(["l1", "l2", "l3"]);

    const [intro, lab, extra] = result.lessons;
    // not_started 不算进入
    expect(intro).toMatchObject({ reached: 3, completed: 3, waiting: 1, idle: 1 });
    // e1 最近活跃，e2 已 28 天没有操作；已结课的 e3 不计入
    expect(lab).toMatchObject({ reached: 3, completed: 1, waiting: 2, idle: 1 });
    // 选做章节不会成为「停在这里」
    expect(extra).toMatchObject({ reached: 0, completed: 0, waiting: 0 });
  });

  it("练习统计未通过人数、平均几次通过和一次通过率", () => {
    const result = buildCourseAnalytics(baseInput());
    const lab = result.blocks.find((block) => block.blockId === "lab");
    expect(lab).toMatchObject({
      title: "修好请求",
      lessonTitle: "第二章",
      kind: "simulation",
      learners: 3,
      passed: 1,
      stuck: 2,
      attempts: 10,
      avgAttemptsToPass: 3,
      firstTryRate: 0,
    });
    const check = result.blocks.find((block) => block.blockId === "check");
    expect(check).toMatchObject({ learners: 1, passed: 1, stuck: 0, avgAttemptsToPass: 1, firstTryRate: 100 });
  });

  it("没有提交记录的练习显示为空，而不是 0 次通过", () => {
    const result = buildCourseAnalytics(baseInput({ blockLearners: [] }));
    expect(result.blocks[0]).toMatchObject({ learners: 0, stuck: 0, avgAttemptsToPass: null, firstTryRate: null });
  });

  it("题目按答错次数排序，错误选项换成题库里的文字", () => {
    const result = buildCourseAnalytics(baseInput());
    expect(result.questions.map((question) => question.questionId)).toEqual(["q1", "q2"]);
    const [q1, q2] = result.questions;
    expect(q1).toMatchObject({
      prompt: "201 之后看哪里？",
      blockTitle: "小测",
      answered: 6,
      wrong: 5,
      wrongRate: 83,
      unrecordedWrong: 1,
    });
    expect(q1.wrongChoices).toEqual([
      { label: "状态码", count: 3 },
      { label: "Host 头", count: 1 },
    ]);
    expect(q2.wrongChoices).toEqual([{ label: "GET、POST", count: 1 }]);
    // 结果里不带正确答案
    expect(JSON.stringify(result.questions)).not.toContain("Location 头");
  });

  it("课程文件缺失时退回显示题目 id", () => {
    const result = buildCourseAnalytics(baseInput({ banks: new Map() }));
    expect(result.questions[0]).toMatchObject({ prompt: "q1" });
    expect(result.questions[0].wrongChoices[0]).toEqual({ label: "a", count: 3 });
  });
});

describe("知识检查评分记录错误选项", () => {
  it("只为答错的题记录所选选项，并过滤题目没有的选项", () => {
    const graded = gradeQuiz(questions, {
      q1: "a",
      q2: ["post", "get", "zzz", "get"],
      q3: "false",
    });
    expect(graded.results).toEqual([
      { questionId: "q1", correct: false, given: "a" },
      { questionId: "q2", correct: false, given: ["get", "post"] },
      { questionId: "q3", correct: true },
    ]);
  });

  it("未作答或填了未知选项时不记录 given", () => {
    const graded = gradeQuiz(questions, { q1: "<script>", q2: "get", q3: "maybe" });
    expect(graded.results).toEqual([
      { questionId: "q1", correct: false },
      { questionId: "q2", correct: false },
      { questionId: "q3", correct: false },
    ]);
  });

  it("答对时不在反馈里回显答案", () => {
    const graded = gradeQuiz(questions, { q1: "b", q2: ["put", "get"], q3: "false" });
    expect(graded.results.every((result) => !("given" in result))).toBe(true);
    expect(graded.score).toBe(100);
  });
});
