"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ActivityId, ConceptId } from "@/lib/generated/course-catalog";
import type { ActivityComponentProps } from "@/lib/learning/types";

const loading = () => <div className="my-8 h-64 animate-pulse rounded-xl border border-dashed border-border bg-muted/30" />;

const Concept0 = dynamic(() => import("../../content/courses/http-from-zero/concepts/http-concepts").then((m) => m.HeadersCookies), { ssr: false, loading });
const Concept1 = dynamic(() => import("../../content/courses/http-from-zero/concepts/http-concepts").then((m) => m.RequestFlow), { ssr: false, loading });
const Concept2 = dynamic(() => import("../../content/courses/http-from-zero/concepts/http-concepts").then((m) => m.UrlAnatomy), { ssr: false, loading });
const Concept3 = dynamic(() => import("../../content/courses/http-retry-basics/concepts/idempotency-deduplication").then((m) => m.IdempotencyDeduplication), { ssr: false, loading });
const Concept4 = dynamic(() => import("../../content/courses/http-retry-basics/concepts/idempotency-lost-response").then((m) => m.IdempotencyLostResponse), { ssr: false, loading });
const Concept5 = dynamic(() => import("../../content/courses/idempotent-retries/concepts/idempotency-deduplication").then((m) => m.IdempotencyDeduplication), { ssr: false, loading });
const Concept6 = dynamic(() => import("../../content/courses/idempotent-retries/concepts/idempotency-lost-response").then((m) => m.IdempotencyLostResponse), { ssr: false, loading });
const Concept7 = dynamic(() => import("../../content/courses/sql-injection-basics/concepts/sql-data-vs-instruction").then((m) => m.SqlDataVsInstruction), { ssr: false, loading });
const Concept8 = dynamic(() => import("../../content/courses/sql-injection-basics/concepts/sql-parameter-binding").then((m) => m.SqlParameterBinding), { ssr: false, loading });
const Activity0 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-from-zero/activities/http-activities").then((m) => m.CookieLabActivity), { ssr: false, loading });
const Activity1 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-from-zero/activities/http-activities").then((m) => m.MethodMatchActivity), { ssr: false, loading });
const Activity2 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-from-zero/activities/http-activities").then((m) => m.RequestBuilderActivity), { ssr: false, loading });
const Activity3 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-retry-basics/activities/idempotency").then((m) => m.IdempotencyActivity), { ssr: false, loading });
const Activity4 = dynamic<ActivityComponentProps>(() => import("../../content/courses/idempotent-retries/activities/idempotency").then((m) => m.IdempotencyActivity), { ssr: false, loading });
const Activity5 = dynamic<ActivityComponentProps>(() => import("../../content/courses/sql-injection-basics/activities/sql-injection").then((m) => m.SqlInjectionActivity), { ssr: false, loading });

export const CONCEPT_COMPONENTS: Record<ConceptId, ComponentType> = {
  "http-from-zero/headers-cookies": Concept0,
  "http-from-zero/request-flow": Concept1,
  "http-from-zero/url-anatomy": Concept2,
  "http-retry-basics/deduplication": Concept3,
  "http-retry-basics/lost-response": Concept4,
  "idempotency.deduplication": Concept5,
  "idempotency.lost-response": Concept6,
  "sql.data-vs-instruction": Concept7,
  "sql.parameter-binding": Concept8,
};

export const ACTIVITY_COMPONENTS: Record<ActivityId, ComponentType<ActivityComponentProps>> = {
  "http-from-zero/cookie-lab": Activity0,
  "http-from-zero/method-match": Activity1,
  "http-from-zero/request-builder": Activity2,
  "http-retry-basics/retry-lab": Activity3,
  "idempotency-lab": Activity4,
  "sql-injection-lab": Activity5,
};
