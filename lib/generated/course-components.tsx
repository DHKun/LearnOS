"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ActivityId, ConceptId } from "@/lib/generated/course-catalog";
import type { ActivityComponentProps } from "@/lib/learning/types";

const loading = () => <div className="my-8 h-64 animate-pulse rounded-xl border border-dashed border-border bg-muted/30" />;

const Concept0 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.CacheConcept), { ssr: false, loading });
const Concept1 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.CookieConcept), { ssr: false, loading });
const Concept2 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.JourneyConcept), { ssr: false, loading });
const Concept3 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.MessageConcept), { ssr: false, loading });
const Concept4 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.StatusConcept), { ssr: false, loading });
const Concept5 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.TlsConcept), { ssr: false, loading });
const Concept6 = dynamic(() => import("../../content/courses/http-fundamentals/concepts/http-concepts").then((m) => m.UrlConcept), { ssr: false, loading });
const Activity0 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.CacheConsole), { ssr: false, loading });
const Activity1 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.CookieConsole), { ssr: false, loading });
const Activity2 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.DiagnosisConsole), { ssr: false, loading });
const Activity3 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.FinalMission), { ssr: false, loading });
const Activity4 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.JsonConsole), { ssr: false, loading });
const Activity5 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.MethodMatcher), { ssr: false, loading });
const Activity6 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-fundamentals/activities/http-activities").then((m) => m.RequestConsole), { ssr: false, loading });

export const CONCEPT_COMPONENTS: Record<ConceptId, ComponentType> = {
  "http-fundamentals/cache": Concept0,
  "http-fundamentals/cookie": Concept1,
  "http-fundamentals/journey": Concept2,
  "http-fundamentals/request": Concept3,
  "http-fundamentals/status": Concept4,
  "http-fundamentals/tls": Concept5,
  "http-fundamentals/url": Concept6,
};

export const ACTIVITY_COMPONENTS: Record<ActivityId, ComponentType<ActivityComponentProps>> = {
  "http-fundamentals/cache-console": Activity0,
  "http-fundamentals/cookie-console": Activity1,
  "http-fundamentals/diagnosis-console": Activity2,
  "http-fundamentals/final-mission": Activity3,
  "http-fundamentals/json-console": Activity4,
  "http-fundamentals/method-matcher": Activity5,
  "http-fundamentals/request-console": Activity6,
};
