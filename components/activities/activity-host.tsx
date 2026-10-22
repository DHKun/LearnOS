"use client";

import { ActivityRenderer } from "@/components/activities/registry";
import { LearningProvider } from "@/lib/learning/context";
import { isActivityId } from "@/lib/activities/catalog";
import type { LearningState } from "@/lib/learning/types";

export function ActivityHost({
  activityId,
  lessonId,
  enrollmentId,
  initialState,
  initialVersion,
  readOnly,
}: {
  activityId: string;
  lessonId: string;
  enrollmentId: string;
  initialState: LearningState | null;
  initialVersion: number;
  readOnly: boolean;
}) {
  if (!isActivityId(activityId)) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        课程配置了未注册的互动组件：{activityId}
      </div>
    );
  }

  return (
    <LearningProvider
      activityId={activityId}
      lessonId={lessonId}
      enrollmentId={enrollmentId}
      initialState={initialState}
      initialVersion={initialVersion}
      readOnly={readOnly}
    >
      <ActivityRenderer activityId={activityId} readOnly={readOnly} />
    </LearningProvider>
  );
}
