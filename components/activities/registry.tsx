"use client";

import { ACTIVITY_COMPONENTS } from "@/lib/generated/course-components";
import type { ActivityId } from "@/lib/activities/catalog";

export function ActivityRenderer({
  activityId,
  readOnly,
}: {
  activityId: ActivityId;
  readOnly: boolean;
}) {
  const Activity = ACTIVITY_COMPONENTS[activityId];
  if (!Activity) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未注册的互动组件：{activityId}
      </div>
    );
  }
  return <Activity readOnly={readOnly} />;
}
