"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import type { ActivityId, ConceptId } from "@/lib/generated/course-catalog";
import type { ActivityComponentProps } from "@/lib/learning/types";

const loading = () => <div className="my-8 h-64 animate-pulse rounded-xl border border-dashed border-border bg-muted/30" />;

const Concept0 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.CodebookConcept), { ssr: false, loading });
const Concept1 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.ColorConcept), { ssr: false, loading });
const Concept2 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.CompressionConcept), { ssr: false, loading });
const Concept3 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.EndianConcept), { ssr: false, loading });
const Concept4 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.FloatConcept), { ssr: false, loading });
const Concept5 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.HexConcept), { ssr: false, loading });
const Concept6 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.OverflowConcept), { ssr: false, loading });
const Concept7 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.ParityConcept), { ssr: false, loading });
const Concept8 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.SignatureConcept), { ssr: false, loading });
const Concept9 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.SwitchesConcept), { ssr: false, loading });
const Concept10 = dynamic(() => import("../../content/courses/bits-and-bytes/concepts/concepts").then((m) => m.Utf8Concept), { ssr: false, loading });
const Concept11 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.AuthConcept), { ssr: false, loading });
const Concept12 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.CacheConcept), { ssr: false, loading });
const Concept13 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.CookieConcept), { ssr: false, loading });
const Concept14 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.JourneyConcept), { ssr: false, loading });
const Concept15 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.MessageConcept), { ssr: false, loading });
const Concept16 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.NegotiationConcept), { ssr: false, loading });
const Concept17 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.RedirectConcept), { ssr: false, loading });
const Concept18 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.RetryConcept), { ssr: false, loading });
const Concept19 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.TlsConcept), { ssr: false, loading });
const Concept20 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.UrlConcept), { ssr: false, loading });
const Activity0 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.ColorLab), { ssr: false, loading });
const Activity1 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.HeaderLab), { ssr: false, loading });
const Activity2 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.ImageLab), { ssr: false, loading });
const Activity3 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.IntLab), { ssr: false, loading });
const Activity4 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.LedLab), { ssr: false, loading });
const Activity5 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.MojibakeLab), { ssr: false, loading });
const Activity6 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.MoneyLab), { ssr: false, loading });
const Activity7 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.ParityLab), { ssr: false, loading });
const Activity8 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.RepairLab), { ssr: false, loading });
const Activity9 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.SizeLab), { ssr: false, loading });
const Activity10 = dynamic<ActivityComponentProps>(() => import("../../content/courses/bits-and-bytes/activities/labs").then((m) => m.Utf8Lab), { ssr: false, loading });
const Activity11 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.CacheLab), { ssr: false, loading });
const Activity12 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.CookieLab), { ssr: false, loading });
const Activity13 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.DiagnosisLab), { ssr: false, loading });
const Activity14 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.FinalMission), { ssr: false, loading });
const Activity15 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.JsonLab), { ssr: false, loading });
const Activity16 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.MethodLab), { ssr: false, loading });
const Activity17 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.RequestLab), { ssr: false, loading });
const Activity18 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.ResponseLab), { ssr: false, loading });
const Activity19 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.UrlLab), { ssr: false, loading });

export const CONCEPT_COMPONENTS: Record<ConceptId, ComponentType> = {
  "bits-and-bytes/codebook": Concept0,
  "bits-and-bytes/color": Concept1,
  "bits-and-bytes/compression": Concept2,
  "bits-and-bytes/endian": Concept3,
  "bits-and-bytes/float": Concept4,
  "bits-and-bytes/hex": Concept5,
  "bits-and-bytes/overflow": Concept6,
  "bits-and-bytes/parity": Concept7,
  "bits-and-bytes/signature": Concept8,
  "bits-and-bytes/switches": Concept9,
  "bits-and-bytes/utf8": Concept10,
  "http-hands-on/auth": Concept11,
  "http-hands-on/cache": Concept12,
  "http-hands-on/cookie": Concept13,
  "http-hands-on/journey": Concept14,
  "http-hands-on/message": Concept15,
  "http-hands-on/negotiation": Concept16,
  "http-hands-on/redirect": Concept17,
  "http-hands-on/retry": Concept18,
  "http-hands-on/tls": Concept19,
  "http-hands-on/url": Concept20,
};

export const ACTIVITY_COMPONENTS: Record<ActivityId, ComponentType<ActivityComponentProps>> = {
  "bits-and-bytes/color-lab": Activity0,
  "bits-and-bytes/header-lab": Activity1,
  "bits-and-bytes/image-lab": Activity2,
  "bits-and-bytes/int-lab": Activity3,
  "bits-and-bytes/led-lab": Activity4,
  "bits-and-bytes/mojibake-lab": Activity5,
  "bits-and-bytes/money-lab": Activity6,
  "bits-and-bytes/parity-lab": Activity7,
  "bits-and-bytes/repair-lab": Activity8,
  "bits-and-bytes/size-lab": Activity9,
  "bits-and-bytes/utf8-lab": Activity10,
  "http-hands-on/cache-lab": Activity11,
  "http-hands-on/cookie-lab": Activity12,
  "http-hands-on/diagnosis-lab": Activity13,
  "http-hands-on/final-mission": Activity14,
  "http-hands-on/json-lab": Activity15,
  "http-hands-on/method-lab": Activity16,
  "http-hands-on/request-lab": Activity17,
  "http-hands-on/response-lab": Activity18,
  "http-hands-on/url-lab": Activity19,
};
