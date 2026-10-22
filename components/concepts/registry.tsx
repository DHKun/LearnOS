"use client";

import { CONCEPT_COMPONENTS } from "@/lib/generated/course-components";
import { isConceptId } from "@/lib/education/concepts";

export function ConceptPlayer({
  conceptId,
  blockId,
}: {
  conceptId: string;
  blockId?: string;
}) {
  if (!isConceptId(conceptId)) {
    return (
      <div className="my-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未注册的概念动画：{conceptId}
      </div>
    );
  }
  const Concept = CONCEPT_COMPONENTS[conceptId];
  return <Concept key={blockId ?? conceptId} />;
}
