"use client";

import * as React from "react";
import { CheckCircle2, FlaskConical } from "lucide-react";

import { ActivityRenderer } from "@/components/activities/registry";
import { isActivityId } from "@/lib/activities/catalog";
import { BlockScope, useChapterLearning } from "@/lib/learning/chapter-context";
import { Badge } from "@/components/ui/badge";

export function SimulationBlock({
  blockId,
  activityId,
}: {
  blockId: string;
  activityId?: string;
}) {
  const chapter = useChapterLearning();
  const block = chapter.blocks.find((item) => item.id === blockId);
  const result = chapter.blockResults[blockId];

  if (!block || block.kind !== "simulation") {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未声明的模拟实验：{blockId}
      </div>
    );
  }
  const effectiveActivityId = activityId ?? block.activityId;
  if (!effectiveActivityId || !isActivityId(effectiveActivityId)) {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        模拟实验缺少 activityId：{blockId}
      </div>
    );
  }

  return (
    <section
      className="my-8 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      data-block-id={blockId}
      data-block-kind="simulation"
      aria-label={`模拟实验：${block.title ?? blockId}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" /> 模拟实验
          </Badge>
          <span className="text-sm font-medium">{block.title ?? "章节模拟"}</span>
        </div>
        {result?.passed && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> 已通过
          </Badge>
        )}
      </header>
      <div className="px-4 py-5 sm:px-6">
        <BlockScope blockId={blockId} kind="simulation">
          <ActivityRenderer activityId={effectiveActivityId} readOnly={chapter.readOnly} />
        </BlockScope>
      </div>
    </section>
  );
}
