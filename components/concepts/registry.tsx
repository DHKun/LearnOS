"use client";

import { CONCEPT_COMPONENTS } from "@/lib/generated/course-components";
import { isConceptId } from "@/lib/education/concepts";
import { BlockScope, useOptionalChapterLearning } from "@/lib/learning/chapter-context";

export function ConceptPlayer({
  conceptId,
  blockId,
}: {
  conceptId: string;
  blockId?: string;
}) {
  const chapter = useOptionalChapterLearning();
  if (!isConceptId(conceptId)) {
    return (
      <div className="my-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未注册的概念动画：{conceptId}
      </div>
    );
  }
  const Concept = CONCEPT_COMPONENTS[conceptId];
  const effectiveBlockId = blockId ?? `concept-${conceptId}`;

  if (!chapter) return <Concept key={effectiveBlockId} />;

  return (
    <BlockScope key={effectiveBlockId} blockId={effectiveBlockId} kind="concept">
      <Concept />
    </BlockScope>
  );
}
