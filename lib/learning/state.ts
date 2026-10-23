import type { LearningState } from "@/lib/learning/types";

export type ChapterState = {
  schemaVersion: 2;
  blocks: Record<string, LearningState>;
};

export type NormalizedChapterState = {
  state: ChapterState;
  legacy: LearningState | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Read both the new v2 block namespace and legacy flat concept/activity state. */
export function normalizeChapterState(raw: LearningState | null): NormalizedChapterState {
  if (
    raw &&
    raw.schemaVersion === 2 &&
    isRecord(raw.blocks)
  ) {
    return {
      state: {
        schemaVersion: 2,
        blocks: raw.blocks as Record<string, LearningState>,
      },
      legacy: null,
    };
  }
  return {
    state: { schemaVersion: 2, blocks: {} },
    legacy: raw,
  };
}

export function withBlockState(
  state: ChapterState,
  blockId: string,
  blockState: LearningState,
): ChapterState {
  return {
    schemaVersion: 2,
    blocks: {
      ...state.blocks,
      [blockId]: blockState,
    },
  };
}

export function blockStateFrom(
  state: ChapterState,
  legacy: LearningState | null,
  blockId: string,
  kind: "concept" | "simulation" | "question",
): LearningState | null {
  const block = state.blocks[blockId];
  if (block !== undefined) return block;
  if (!legacy) return null;
  // Old v2 concept state was saved flat by ConceptFrame. Only claim it for a
  // concept block, never for a formal simulation/question result.
  if (kind === "concept" && (typeof legacy.conceptStep === "number" || typeof legacy.blockId === "string")) {
    return legacy;
  }
  return null;
}
