"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ActivityId } from "@/lib/activities/catalog";
import type { ActivityComponentProps } from "@/lib/learning/types";

const loading = () => (
  <div className="grid h-72 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
    正在加载互动组件…
  </div>
);

const SqlInjectionActivity = dynamic<ActivityComponentProps>(
  () => import("./sql-injection").then((module) => module.SqlInjectionActivity),
  { ssr: false, loading },
);

const IdempotencyActivity = dynamic<ActivityComponentProps>(
  () => import("./idempotency").then((module) => module.IdempotencyActivity),
  { ssr: false, loading },
);

const ACTIVITIES: Record<ActivityId, ComponentType<ActivityComponentProps>> = {
  "sql-injection-lab": SqlInjectionActivity,
  "idempotency-lab": IdempotencyActivity,
};

export function ActivityRenderer({
  activityId,
  readOnly,
}: {
  activityId: ActivityId;
  readOnly: boolean;
}) {
  const Activity = ACTIVITIES[activityId];
  if (!Activity) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未注册的互动组件：{activityId}
      </div>
    );
  }
  return <Activity readOnly={readOnly} />;
}
