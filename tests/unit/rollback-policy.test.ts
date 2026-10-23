import { describe, expect, it } from "vitest";

import { structureMatchesSnapshot } from "../../deploy/updater/updater.mjs";

const article = {
  slug: "intro",
  title: "介绍",
  position: 0,
  type: "article",
  required: true,
  completionPolicy: "manual",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    slug: "intro",
    position: 0,
    required: true,
    type: "article",
    completion_policy: "manual",
    config: {},
    ...overrides,
  };
}

describe("回滚结构兼容性检查", () => {
  it("结构一致时允许回滚", () => {
    expect(structureMatchesSnapshot({ lessons: [article] }, [row()])).toBe(true);
  });

  it("章节 slug/顺序/类型/完成策略变化时拒绝回滚", () => {
    expect(structureMatchesSnapshot({ lessons: [article] }, [row({ slug: "other" })])).toBe(false);
    expect(structureMatchesSnapshot({ lessons: [article] }, [row({ position: 1 })])).toBe(false);
    expect(structureMatchesSnapshot({ lessons: [article] }, [row({ type: "quiz" })])).toBe(false);
    expect(
      structureMatchesSnapshot({ lessons: [article] }, [row({ completion_policy: "reported" })]),
    ).toBe(false);
  });

  it("测验及格线、finalExam 或题库哈希变化时拒绝回滚", () => {
    const quiz = {
      slug: "final",
      title: "测验",
      position: 1,
      type: "quiz",
      required: true,
      completionPolicy: "server_validated",
      passScore: 70,
      finalExam: true,
      quizHash: "abc",
    };
    const quizRow = {
      slug: "final",
      position: 1,
      required: true,
      type: "quiz",
      completion_policy: "server_validated",
      config: { passScore: 70, finalExam: true, quizHash: "abc" },
    };
    expect(structureMatchesSnapshot({ lessons: [quiz] }, [quizRow])).toBe(true);
    expect(
      structureMatchesSnapshot(
        { lessons: [quiz] },
        [{ ...quizRow, config: { ...quizRow.config, passScore: 80 } }],
      ),
    ).toBe(false);
    expect(
      structureMatchesSnapshot(
        { lessons: [quiz] },
        [{ ...quizRow, config: { ...quizRow.config, finalExam: false } }],
      ),
    ).toBe(false);
    expect(
      structureMatchesSnapshot(
        { lessons: [quiz] },
        [{ ...quizRow, config: { ...quizRow.config, quizHash: "other" } }],
      ),
    ).toBe(false);
  });

  it("交互 activity/validator 或指纹变化时拒绝回滚", () => {
    const interactive = {
      slug: "lab",
      title: "实验",
      position: 0,
      type: "interactive",
      required: true,
      completionPolicy: "server_validated",
      activityId: "lab",
      validatorId: "validator",
      validatorFingerprint: "fingerprint",
    };
    const interactiveRow = {
      slug: "lab",
      position: 0,
      required: true,
      type: "interactive",
      completion_policy: "server_validated",
      config: {
        activityId: "lab",
        validatorId: "validator",
        validatorFingerprintVersion: 2,
        validatorFingerprint: "fingerprint",
      },
    };
    expect(structureMatchesSnapshot({ lessons: [interactive] }, [interactiveRow])).toBe(true);
    expect(
      structureMatchesSnapshot(
        { lessons: [interactive] },
        [{ ...interactiveRow, config: { ...interactiveRow.config, activityId: "other" } }],
      ),
    ).toBe(false);
    expect(
      structureMatchesSnapshot(
        { lessons: [interactive] },
        [{ ...interactiveRow, config: { ...interactiveRow.config, validatorId: "other" } }],
      ),
    ).toBe(false);
    expect(
      structureMatchesSnapshot(
        { lessons: [interactive] },
        [
          {
            ...interactiveRow,
            config: { ...interactiveRow.config, validatorFingerprint: "changed" },
          },
        ],
      ),
    ).toBe(false);
  });
});
