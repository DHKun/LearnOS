import { describe, expect, it } from "vitest";

import {
  buildChapterStructure,
  chapterConfig,
  resolveChapterCompletion,
  type QuizBlockResolver,
} from "@/lib/content/chapters";
import type { ArticleLessonManifest } from "@/lib/content/manifest";
import {
  blockStateFrom,
  normalizeChapterState,
  withBlockState,
} from "@/lib/learning/state";

describe("章节 Block 状态命名空间", () => {
  it("把旧的扁平概念状态迁移为可读取的 legacy 状态", () => {
    const normalized = normalizeChapterState({
      conceptId: "sql.data-vs-instruction",
      blockId: "sql-data-vs-instruction",
      conceptStep: 2,
    });
    expect(normalized.legacy?.conceptStep).toBe(2);
    expect(blockStateFrom(normalized.state, normalized.legacy, "sql-origin", "concept")).toEqual(
      normalized.legacy,
    );
    expect(blockStateFrom(normalized.state, normalized.legacy, "lab", "simulation")).toBeNull();
  });

  it("多个 Block 状态互不覆盖", () => {
    let state = normalizeChapterState(null).state;
    state = withBlockState(state, "flow-1", { step: 3 });
    state = withBlockState(state, "request-lab", { method: "GET", path: "/users/1" });
    expect(state.blocks["flow-1"]).toEqual({ step: 3 });
    expect(state.blocks["request-lab"]).toEqual({ method: "GET", path: "/users/1" });
    const next = withBlockState(state, "flow-1", { step: 4 });
    expect(next.blocks["request-lab"]).toEqual({ method: "GET", path: "/users/1" });
  });
});

function lesson(overrides: Partial<ArticleLessonManifest> = {}): ArticleLessonManifest {
  return {
    slug: "chapter",
    title: "章节",
    required: true,
    type: "article",
    source: "lessons/chapter.mdx",
    completionPolicy: "server_validated",
    blocks: [
      { id: "sim", kind: "simulation", activityId: "course/sim" },
      { id: "quiz", kind: "question", source: "assessments/q.json" },
    ],
    completion: { mode: "all", requiredBlocks: ["sim", "quiz"] },
    ...overrides,
  } as ArticleLessonManifest;
}

const quiz: QuizBlockResolver = () => ({ quizHash: "quiz-hash", passScore: 70 });
const fingerprints: Record<string, string> = { "course/sim": "validator-hash" };

describe("章节完成规则与结构冻结", () => {
  it("省略 completion 的 server_validated 章节默认 all", () => {
    const completion = resolveChapterCompletion({
      ...lesson(),
      completion: undefined,
    } as ArticleLessonManifest);
    expect(completion).toEqual({ mode: "all", requiredBlocks: ["sim", "quiz"] });
  });

  it("新增不影响完成条件的可选 Block 不改变章节结构哈希", () => {
    const base = buildChapterStructure(lesson(), {
      quiz,
      validatorFingerprint: (id) => fingerprints[id] ?? null,
    });
    const withOptional = buildChapterStructure(
      lesson({
        blocks: [
          ...(lesson().blocks ?? []),
          { id: "optional", kind: "question", source: "assessments/optional.json" },
        ],
      }),
      { quiz, validatorFingerprint: (id) => fingerprints[id] ?? null },
    );
    expect(withOptional.completion).toEqual(base.completion);
    expect(withOptional.hash).toBe(base.hash);
  });

  it("修改必需验证器或题库时结构哈希变化", () => {
    const base = buildChapterStructure(lesson(), {
      quiz,
      validatorFingerprint: (id) => fingerprints[id] ?? null,
    });
    const changedValidator = buildChapterStructure(lesson(), {
      quiz,
      validatorFingerprint: () => "changed-validator",
    });
    const changedQuiz = buildChapterStructure(lesson(), {
      quiz: () => ({ quizHash: "changed-quiz", passScore: 70 }),
      validatorFingerprint: (id) => fingerprints[id] ?? null,
    });
    expect(changedValidator.hash).not.toBe(base.hash);
    expect(changedQuiz.hash).not.toBe(base.hash);
  });

  it("config 保存 blocks/completion/chapterHash", () => {
    const structure = buildChapterStructure(lesson(), {
      quiz,
      validatorFingerprint: (id) => fingerprints[id] ?? null,
    });
    const config = chapterConfig(lesson(), structure);
    expect(config.blocks).toHaveLength(2);
    expect(config.completion).toEqual({ mode: "all", requiredBlocks: ["sim", "quiz"] });
    expect(config.chapterHash).toBe(structure.hash);
  });
});
