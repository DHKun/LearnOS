"use client";

import * as React from "react";

import { LearningClient } from "@/lib/learning/client";
import type { LearningSDK, LearningState } from "@/lib/learning/types";

type LearningContextValue = {
  sdk: LearningSDK;
  activityId: string;
  lessonId: string;
  enrollmentId: string;
  initialState: LearningState | null;
  initialVersion: number;
  readOnly: boolean;
};

const LearningContext = React.createContext<LearningContextValue | null>(null);

type LearningProviderProps = Omit<LearningContextValue, "sdk"> & {
  children: React.ReactNode;
};

export function LearningProvider({
  activityId,
  lessonId,
  enrollmentId,
  initialState,
  initialVersion,
  readOnly,
  children,
}: LearningProviderProps) {
  const [client] = React.useState(
    () =>
      new LearningClient({
        lessonId,
        enrollmentId,
        initialVersion,
      }),
  );

  React.useEffect(() => {
    if (readOnly) return;
    client.start();
    const onPageHide = () => {
      void client.flushOnUnload();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [client, readOnly]);

  const value = React.useMemo<LearningContextValue>(
    () => ({
      sdk: client,
      activityId,
      lessonId,
      enrollmentId,
      initialState,
      initialVersion,
      readOnly,
    }),
    [activityId, client, enrollmentId, initialState, initialVersion, lessonId, readOnly],
  );

  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning(): LearningContextValue {
  const value = React.useContext(LearningContext);
  if (!value) throw new Error("useLearning must be used inside LearningProvider");
  return value;
}
