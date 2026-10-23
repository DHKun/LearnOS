"use client";

import * as React from "react";

import { ApiClientError } from "@/lib/client/api";
import { useLearning } from "@/lib/learning/context";
import type { LearningState } from "@/lib/learning/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

/**
 * Restores the activity state supplied by the server, persists subsequent
 * changes through the SDK, and exposes save/conflict status to the activity UI.
 */
export function useActivityState<T extends LearningState>(
  initial: T,
  normalize: (value: unknown) => T,
) {
  const { initialState, sdk, readOnly } = useLearning();
  const [state, setState] = React.useState<T>(() =>
    initialState ? normalize(initialState) : initial,
  );
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const firstRender = React.useRef(true);
  const conflictRef = React.useRef(false);

  React.useEffect(() => {
    if (readOnly) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A stale version must stay visible until the student explicitly reloads;
    // a late-arriving retry must not mask the conflict as a successful save.
    if (conflictRef.current) return;

    setStatus("saving");
    setError(null);
    void sdk
      .saveState(state)
      .then(() => {
        if (conflictRef.current) return;
        setStatus("saved");
        setConflict(false);
      })
      .catch((caught) => {
        if (caught instanceof ApiClientError && caught.code === "STATE_VERSION_CONFLICT") {
          conflictRef.current = true;
          setStatus("conflict");
          setConflict(true);
          setError("实验状态已在其他页面更新，请重新加载后再继续。");
          return;
        }
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "实验状态保存失败");
      });
  }, [readOnly, sdk, state]);

  const reload = React.useCallback(async () => {
    const snapshot = await sdk.refreshState();
    conflictRef.current = false;
    setState(snapshot.state ? normalize(snapshot.state) : initial);
    setConflict(false);
    setStatus("idle");
    setError(null);
  }, [initial, normalize, sdk]);

  return {
    state,
    setState,
    status,
    error,
    conflict,
    reload,
  };
}

/**
 * Block-scoped alias of the existing serialized-state hook. It is identical
 * because `BlockScope` supplies a scoped SDK, but naming it explicitly keeps
 * course components from depending on the legacy lesson-wide hook.
 */
export const useBlockState = useActivityState;
