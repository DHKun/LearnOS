import { describe, expect, it } from "vitest";

import { createHash } from "node:crypto";

import { getActivityDefinition } from "@/lib/activities/catalog";
import { buildChapterStructure, chapterConfig } from "@/lib/content/chapters";
import { getValidatorFingerprint } from "@/lib/content/validators.server";
import { canonicalJson } from "@/lib/crypto/canonical-json";
import { loadCourse, readBlockQuizFile, type LoadedCourse } from "@/lib/content/loader";
import type { ArticleLessonManifest } from "@/lib/content/manifest";
import { structureMatches, type DbLesson } from "../../scripts/courses/sync";

function oneLessonCourse(lesson: ArticleLessonManifest): LoadedCourse {
  const loaded = loadCourse("http-from-zero");
  return {
    ...loaded,
    manifest: {
      ...loaded.manifest,
      lessons: [lesson],
    },
  };
}

function configFor(course: LoadedCourse, lesson: ArticleLessonManifest) {
  const structure = buildChapterStructure(lesson, {
    quiz: (block) => {
      const quiz = readBlockQuizFile(course, lesson, block);
      return {
        quizHash: createHash("sha256").update(canonicalJson(quiz)).digest("hex"),
        passScore: block.passScore ?? quiz.passScore,
      };
    },
    validatorFingerprint: (activityId) => {
      const activity = getActivityDefinition(activityId);
      return activity ? getValidatorFingerprint(activity.validatorId) ?? null : null;
    },
  });
  return { structure, config: chapterConfig(lesson, structure) };
}

function dbRow(lesson: ArticleLessonManifest, config: Record<string, unknown>): DbLesson {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: lesson.slug,
    position: 0,
    required: lesson.required,
    type: "article",
    completion_policy:
      lesson.completion && lesson.completion.mode !== "manual"
        ? "server_validated"
        : "manual",
    config,
  };
}

describe("混合章节同步冻结", () => {
  const loaded = loadCourse("http-from-zero");
  const base = loaded.manifest.lessons.find(
    (lesson): lesson is ArticleLessonManifest => lesson.slug === "request-response",
  )!;

  it("未变化的章节结构兼容", () => {
    const course = oneLessonCourse(base);
    const { config } = configFor(course, base);
    expect(structureMatches(course, [dbRow(base, config)])).toBe(true);
  });

  it("新增不影响完成条件的可选 Block 仍兼容", () => {
    const course = oneLessonCourse(base);
    const { config } = configFor(course, base);
    const extended: ArticleLessonManifest = {
      ...base,
      blocks: [
        ...(base.blocks ?? []),
        {
          id: "optional-note",
          kind: "question",
          source: "assessments/status-check.server.json",
        },
      ],
    };
    expect(structureMatches(oneLessonCourse(extended), [dbRow(extended, config)])).toBe(true);
  });

  it("修改必需 Block 的验证器时拒绝", () => {
    const course = oneLessonCourse(base);
    const { config } = configFor(course, base);
    const changed: ArticleLessonManifest = {
      ...base,
      blocks: [{ id: "request-lab", kind: "simulation", activityId: "http-from-zero/method-match" }],
      completion: { mode: "all", requiredBlocks: ["request-lab"] },
    };
    expect(structureMatches(oneLessonCourse(changed), [dbRow(changed, config)])).toBe(false);
  });

  it("修改完成规则或 requiredBlocks 时拒绝", () => {
    const course = oneLessonCourse(base);
    const { config } = configFor(course, base);
    const changed: ArticleLessonManifest = {
      ...base,
      completion: { mode: "any", requiredBlocks: ["request-lab"] },
    };
    expect(structureMatches(oneLessonCourse(changed), [dbRow(changed, config)])).toBe(false);
  });
});
