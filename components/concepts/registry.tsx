"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import { isConceptId, type ConceptId } from "@/lib/education/concepts";

const loading = () => (
  <div className="my-8 grid h-64 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
    正在加载概念动画…
  </div>
);

const SqlDataVsInstruction = dynamic(
  () => import("./sql-data-vs-instruction").then((module) => module.SqlDataVsInstruction),
  { ssr: false, loading },
);
const SqlParameterBinding = dynamic(
  () => import("./sql-parameter-binding").then((module) => module.SqlParameterBinding),
  { ssr: false, loading },
);
const IdempotencyLostResponse = dynamic(
  () => import("./idempotency-lost-response").then((module) => module.IdempotencyLostResponse),
  { ssr: false, loading },
);
const IdempotencyDeduplication = dynamic(
  () => import("./idempotency-deduplication").then((module) => module.IdempotencyDeduplication),
  { ssr: false, loading },
);

const CONCEPTS: Record<ConceptId, ComponentType> = {
  "sql.data-vs-instruction": SqlDataVsInstruction,
  "sql.parameter-binding": SqlParameterBinding,
  "idempotency.lost-response": IdempotencyLostResponse,
  "idempotency.deduplication": IdempotencyDeduplication,
};

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
  const Concept = CONCEPTS[conceptId];
  return <Concept key={blockId ?? conceptId} />;
}
