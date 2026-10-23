"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/client/api";
import type { PublicChapterBlock } from "@/lib/content/blocks";
import { LearningClient } from "@/lib/learning/client";
import {
  LearningContext,
  useLearning,
  type LearningContextValue,
} from "@/lib/learning/context";
import {
  blockStateFrom,
  normalizeChapterState,
  withBlockState,
  type ChapterState,
} from "@/lib/learning/state";
import type {
  LearningSDK,
  LearningState,
  LearningStateSnapshot,
} from "@/lib/learning/types";
import type {
  BlockResultSummary,
  BlockSubmitResult,
  ChapterCompletionSummary,
} from "@/lib/types";
import { createUuid } from "@/lib/uuid";

export type BlockKind = "concept" | "simulation" | "question";

type ChapterContextValue = {
  lessonId: string;
  enrollmentId: string;
  readOnly: boolean;
  blocks: PublicChapterBlock[];
  completion: ChapterCompletionSummary;
  blockResults: Record<string, BlockResultSummary>;
  /** Server-authoritative chapter completion, reflected optimistically after submit. */
  chapterCompleted: boolean;
  markChapterCompleted(): void;
  saveBlockState(blockId: string, state: LearningState): Promise<{ version: number }>;
  getBlockState(blockId: string, kind: BlockKind): LearningState | null;
  submitBlock(blockId: string, submission: Record<string, unknown>): Promise<BlockSubmitResult>;
  refreshBlockState(blockId: string, kind: BlockKind): Promise<LearningStateSnapshot>;
};

const ChapterContext = React.createContext<ChapterContextValue | null>(null);

export function useChapterLearning(): ChapterContextValue {
  const value = React.useContext(ChapterContext);
  if (!value) throw new Error("useChapterLearning must be used inside ChapterLearningProvider");
  return value;
}

export function useOptionalChapterLearning(): ChapterContextValue | null {
  return React.useContext(ChapterContext);
}

export function ChapterLearningProvider({
  lessonId,
  enrollmentId,
  initialState,
  initialVersion,
  readOnly,
  blocks,
  completion,
  blockResults: initialBlockResults,
  completed: initialCompleted,
  children,
}: {
  lessonId: string;
  enrollmentId: string;
  initialState: LearningState | null;
  initialVersion: number;
  readOnly: boolean;
  blocks: PublicChapterBlock[];
  completion: ChapterCompletionSummary;
  blockResults: Record<string, BlockResultSummary>;
  completed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const normalized = React.useMemo(() => normalizeChapterState(initialState), [initialState]);
  const [state, setState] = React.useState<ChapterState>(normalized.state);
  const stateRef = React.useRef(state);
  const [version, setVersion] = React.useState(initialVersion);
  const [blockResults, setBlockResults] =
    React.useState<Record<string, BlockResultSummary>>(initialBlockResults);
  const [chapterCompleted, setChapterCompleted] = React.useState(initialCompleted);
  const [client] = React.useState(
    () => new LearningClient({ lessonId, enrollmentId, initialVersion }),
  );

  stateRef.current = state;

  // After `router.refresh()` the server may know more than the initial render
  // (another tab, a navigation, or an auto-completed chapter). Merge downwards
  // so locally-known pass results and completion are never lost.
  React.useEffect(() => {
    setBlockResults((current) => {
      const merged = { ...current };
      for (const [blockId, result] of Object.entries(initialBlockResults)) {
        const existing = merged[blockId];
        merged[blockId] =
          existing?.passed === true
            ? { ...result, ...existing, passed: true }
            : result;
      }
      return merged;
    });
  }, [initialBlockResults]);

  React.useEffect(() => {
    if (initialCompleted) setChapterCompleted(true);
  }, [initialCompleted]);

  const markChapterCompleted = React.useCallback(() => {
    setChapterCompleted(true);
  }, []);

  React.useEffect(() => {
    if (readOnly) return;
    client.start();
    const onPageHide = () => {
      void client.flushOnUnload();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [client, readOnly]);

  const saveBlockState = React.useCallback(
    (blockId: string, blockState: LearningState) => {
      if (readOnly) return Promise.resolve({ version });
      const next = withBlockState(stateRef.current, blockId, blockState);
      stateRef.current = next;
      setState(next);
      return client.saveState(next).then((result) => {
        setVersion(result.version);
        return result;
      });
    },
    [client, readOnly, version],
  );

  const getBlockState = React.useCallback(
    (blockId: string, kind: BlockKind) =>
      blockStateFrom(stateRef.current, normalized.legacy, blockId, kind),
    [normalized.legacy],
  );

  const submitBlock = React.useCallback(
    async (blockId: string, submission: Record<string, unknown>) => {
      const result = await apiFetch<BlockSubmitResult>("/api/learning/blocks/submit", {
        method: "POST",
        body: JSON.stringify({
          attemptId: createUuid(),
          enrollmentId,
          lessonId,
          blockId,
          submission,
        }),
      });
      const block = blocks.find((item) => item.id === blockId);
      const previous = blockResults[blockId];
      setBlockResults((current) => ({
        ...current,
        [blockId]: {
          blockId,
          kind: block?.kind ?? "question",
          passed: result.passed || previous?.passed === true,
          attempts: (previous?.attempts ?? 0) + (result.duplicate ? 0 : 1),
          score: result.score ?? previous?.score ?? null,
          feedback: result.feedback,
          firstPassedAt:
            previous?.firstPassedAt ??
            (result.passed ? new Date().toISOString() : null),
        },
      }));
      // Completion is decided by the server transaction. Mirror only that
      // returned status so the chapter UI updates without a page reload.
      if (result.chapterCompleted || result.lessonStatus === "completed") {
        setChapterCompleted(true);
      }
      // A passing block only changes server-rendered navigation/progress when
      // it actually completes the chapter. Skip the full page refresh when
      // another required block is still pending.
      if (result.chapterCompleted || result.lessonStatus === "completed") router.refresh();
      return result;
    },
    [blockResults, blocks, enrollmentId, lessonId, router],
  );

  const refreshBlockState = React.useCallback(
    async (blockId: string, kind: BlockKind) => {
      const snapshot = await client.refreshState();
      const next = normalizeChapterState(snapshot.state);
      stateRef.current = next.state;
      setState(next.state);
      setVersion(snapshot.version);
      return {
        state: blockStateFrom(next.state, next.legacy, blockId, kind),
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
      };
    },
    [client],
  );

  const value = React.useMemo<ChapterContextValue>(
    () => ({
      lessonId,
      enrollmentId,
      readOnly,
      blocks,
      completion,
      blockResults,
      chapterCompleted,
      markChapterCompleted,
      saveBlockState,
      getBlockState,
      submitBlock,
      refreshBlockState,
    }),
    [
      blockResults,
      blocks,
      chapterCompleted,
      completion,
      enrollmentId,
      getBlockState,
      lessonId,
      markChapterCompleted,
      readOnly,
      refreshBlockState,
      saveBlockState,
      submitBlock,
    ],
  );

  const centralLearning = React.useMemo<LearningContextValue>(
    () => ({
      sdk: client,
      activityId: "chapter",
      lessonId,
      enrollmentId,
      initialState: normalized.legacy,
      initialVersion,
      readOnly,
    }),
    [client, enrollmentId, initialVersion, lessonId, normalized.legacy, readOnly],
  );

  return (
    <ChapterContext.Provider value={value}>
      <LearningContext.Provider value={centralLearning}>{children}</LearningContext.Provider>
    </ChapterContext.Provider>
  );
}

export function BlockScope({
  blockId,
  kind,
  children,
}: {
  blockId: string;
  kind: BlockKind;
  children: React.ReactNode;
}) {
  const chapter = useChapterLearning();
  const parent = useLearning();
  const chapterRef = React.useRef(chapter);
  chapterRef.current = chapter;
  const initialState = chapter.getBlockState(blockId, kind);

  const sdk = React.useMemo<LearningSDK>(
    () => ({
      start: () => parent.sdk.start(),
      track: (type, payload = {}, stepId) =>
        parent.sdk.track(
          type,
          { ...payload, blockId },
          stepId ? `${blockId}:${stepId}` : blockId,
        ),
      saveState: (state) => chapterRef.current.saveBlockState(blockId, state),
      complete: async () => ({ recorded: false }),
      submit: (submission) => chapterRef.current.submitBlock(blockId, submission),
      refreshState: () => chapterRef.current.refreshBlockState(blockId, kind),
    }),
    [blockId, kind, parent.sdk],
  );

  const value = React.useMemo<LearningContextValue>(
    () => ({
      sdk,
      activityId: blockId,
      lessonId: chapter.lessonId,
      enrollmentId: chapter.enrollmentId,
      initialState,
      initialVersion: parent.initialVersion,
      readOnly: chapter.readOnly,
    }),
    [blockId, chapter.enrollmentId, chapter.lessonId, chapter.readOnly, initialState, parent.initialVersion, sdk],
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}
