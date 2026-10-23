import { createHash } from "node:crypto";

import { canonicalJson } from "@/lib/crypto/canonical-json";
import type {
  ArticleLessonManifest,
  ChapterBlock,
} from "@/lib/content/manifest";

export type ResolvedChapterCompletion = {
  mode: "manual" | "all" | "any";
  requiredBlocks: string[];
};

/**
 * Normalize how a v3 chapter completes. The manifest may omit `completion`:
 * a manual article stays manual; a server-validated article with blocks means
 * "complete all declared blocks".
 */
export function resolveChapterCompletion(lesson: ArticleLessonManifest): ResolvedChapterCompletion {
  if (lesson.completion) {
    return {
      mode: lesson.completion.mode,
      requiredBlocks: [...lesson.completion.requiredBlocks],
    };
  }
  if (lesson.completionPolicy === "server_validated") {
    const blocks = lesson.blocks ?? [];
    if (blocks.length === 0) {
      throw new Error(`章节 ${lesson.slug} 使用 server_validated 但没有可验证的 blocks`);
    }
    return { mode: "all", requiredBlocks: blocks.map((block) => block.id) };
  }
  return { mode: "manual", requiredBlocks: [] };
}

export function chapterBlocks(lesson: ArticleLessonManifest): ChapterBlock[] {
  return lesson.blocks ?? [];
}

export function hasServerValidatedCompletion(lesson: ArticleLessonManifest): boolean {
  return resolveChapterCompletion(lesson).mode !== "manual";
}

export type QuizBlockResolver = (block: Extract<ChapterBlock, { kind: "question" }>) => {
  quizHash: string;
  passScore: number;
};

export type ValidatorResolver = (activityId: string) => string | null;

export type RequiredBlockStructure =
  | {
      id: string;
      kind: "simulation";
      activityId: string;
      validatorFingerprint: string;
    }
  | {
      id: string;
      kind: "question";
      quizHash: string;
      passScore: number;
    };

/**
 * Structural signature used by sync freezing and deployment scan. Only blocks
 * that participate in completion are included, so adding/removing an optional
 * practice block does not invalidate existing learner progress.
 */
export function buildChapterStructure(
  lesson: ArticleLessonManifest,
  resolvers: { quiz: QuizBlockResolver; validatorFingerprint: ValidatorResolver },
): { completion: ResolvedChapterCompletion; required: RequiredBlockStructure[]; hash: string } {
  const completion = resolveChapterCompletion(lesson);
  const byId = new Map((lesson.blocks ?? []).map((block) => [block.id, block]));

  const required = completion.requiredBlocks
    .map((blockId) => {
      const block = byId.get(blockId);
      if (!block) {
        throw new Error(`章节 ${lesson.slug} 的 requiredBlock 不存在: ${blockId}`);
      }
      if (block.kind === "simulation") {
        const fingerprint = resolvers.validatorFingerprint(block.activityId);
        if (!fingerprint) {
          throw new Error(
            `章节 ${lesson.slug} 的模拟 Block ${blockId} 缺少 validator: ${block.activityId}`,
          );
        }
        return {
          id: block.id,
          kind: "simulation" as const,
          activityId: block.activityId,
          validatorFingerprint: fingerprint,
        };
      }
      const quiz = resolvers.quiz(block);
      return {
        id: block.id,
        kind: "question" as const,
        quizHash: quiz.quizHash,
        passScore: quiz.passScore,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const hash = createHash("sha256")
    .update(
      canonicalJson({
        mode: completion.mode,
        requiredBlocks: completion.requiredBlocks.slice().sort(),
        required,
      }),
    )
    .digest("hex");

  return { completion, required, hash };
}

/** Config JSON stored on `lessons.config` for a v3 article chapter. */
export function chapterConfig(
  lesson: ArticleLessonManifest,
  structure: ReturnType<typeof buildChapterStructure>,
): Record<string, unknown> {
  const blocks = (lesson.blocks ?? []).map((block) =>
    block.kind === "simulation"
      ? { id: block.id, kind: block.kind, activityId: block.activityId, title: block.title }
      : {
          id: block.id,
          kind: block.kind,
          source: block.source,
          passScore: block.passScore,
          title: block.title,
        },
  );
  return {
    blocks,
    completion: structure.completion,
    chapterHash: structure.hash,
  };
}

/** Validate that a completion rule only references real, server-verifiable blocks. */
export function validateChapterBlocks(lesson: ArticleLessonManifest): void {
  const blocks = lesson.blocks ?? [];
  const ids = new Set<string>();
  for (const block of blocks) {
    if (ids.has(block.id)) throw new Error(`章节 ${lesson.slug} 的 Block ID 重复: ${block.id}`);
    ids.add(block.id);
  }
  const completion = resolveChapterCompletion(lesson);
  if (completion.mode === "manual" && completion.requiredBlocks.length > 0) {
    throw new Error(`章节 ${lesson.slug} 的 manual 完成模式不能声明 requiredBlocks`);
  }
  if (completion.mode !== "manual") {
    if (completion.requiredBlocks.length === 0) {
      throw new Error(`章节 ${lesson.slug} 的 ${completion.mode} 完成模式缺少 requiredBlocks`);
    }
    for (const blockId of completion.requiredBlocks) {
      const block = blocks.find((item) => item.id === blockId);
      if (!block) throw new Error(`章节 ${lesson.slug} 的 requiredBlock 不存在: ${blockId}`);
      if (block.kind !== "simulation" && block.kind !== "question") {
        throw new Error(`章节 ${lesson.slug} 的 requiredBlock 不可正式验证: ${blockId}`);
      }
    }
  }
}
