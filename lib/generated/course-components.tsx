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
const Concept11 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.GrepConcept), { ssr: false, loading });
const Concept12 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.MoveConcept), { ssr: false, loading });
const Concept13 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.PathLookupConcept), { ssr: false, loading });
const Concept14 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.PathsConcept), { ssr: false, loading });
const Concept15 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.PermsConcept), { ssr: false, loading });
const Concept16 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.PipeConcept), { ssr: false, loading });
const Concept17 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.ShellConcept), { ssr: false, loading });
const Concept18 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.SignalConcept), { ssr: false, loading });
const Concept19 = dynamic(() => import("../../content/courses/command-line/concepts/concepts").then((m) => m.UnlinkConcept), { ssr: false, loading });
const Concept20 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.ArrayListConcept), { ssr: false, loading });
const Concept21 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.BfsConcept), { ssr: false, loading });
const Concept22 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.BinaryConcept), { ssr: false, loading });
const Concept23 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.GrowthConcept), { ssr: false, loading });
const Concept24 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.HashConcept), { ssr: false, loading });
const Concept25 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.SortConcept), { ssr: false, loading });
const Concept26 = dynamic(() => import("../../content/courses/data-structures/concepts/concepts").then((m) => m.StackQueueConcept), { ssr: false, loading });
const Concept27 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.AreasConcept), { ssr: false, loading });
const Concept28 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.BranchConcept), { ssr: false, loading });
const Concept29 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.LogConcept), { ssr: false, loading });
const Concept30 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.MergeConcept), { ssr: false, loading });
const Concept31 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.RemoteConcept), { ssr: false, loading });
const Concept32 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.RevertConcept), { ssr: false, loading });
const Concept33 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.SnapshotConcept), { ssr: false, loading });
const Concept34 = dynamic(() => import("../../content/courses/git-basics/concepts/concepts").then((m) => m.UndoConcept), { ssr: false, loading });
const Concept35 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.CacheConcept), { ssr: false, loading });
const Concept36 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.CycleConcept), { ssr: false, loading });
const Concept37 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.JumpConcept), { ssr: false, loading });
const Concept38 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.MemoryConcept), { ssr: false, loading });
const Concept39 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.PartsConcept), { ssr: false, loading });
const Concept40 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.ScheduleConcept), { ssr: false, loading });
const Concept41 = dynamic(() => import("../../content/courses/how-programs-run/concepts/concepts").then((m) => m.StackConcept), { ssr: false, loading });
const Concept42 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.AuthConcept), { ssr: false, loading });
const Concept43 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.CacheConcept), { ssr: false, loading });
const Concept44 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.CookieConcept), { ssr: false, loading });
const Concept45 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.JourneyConcept), { ssr: false, loading });
const Concept46 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.MessageConcept), { ssr: false, loading });
const Concept47 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.NegotiationConcept), { ssr: false, loading });
const Concept48 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.RedirectConcept), { ssr: false, loading });
const Concept49 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.RetryConcept), { ssr: false, loading });
const Concept50 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.TlsConcept), { ssr: false, loading });
const Concept51 = dynamic(() => import("../../content/courses/http-hands-on/concepts/http-concepts").then((m) => m.UrlConcept), { ssr: false, loading });
const Concept52 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.ArpConcept), { ssr: false, loading });
const Concept53 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.DnsConcept), { ssr: false, loading });
const Concept54 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.NatConcept), { ssr: false, loading });
const Concept55 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.PacketsConcept), { ssr: false, loading });
const Concept56 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.PortsConcept), { ssr: false, loading });
const Concept57 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.RoutingConcept), { ssr: false, loading });
const Concept58 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.SubnetConcept), { ssr: false, loading });
const Concept59 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.TcpConcept), { ssr: false, loading });
const Concept60 = dynamic(() => import("../../content/courses/networking-basics/concepts/concepts").then((m) => m.TracerouteConcept), { ssr: false, loading });
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
const Activity11 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.DiskLab), { ssr: false, loading });
const Activity12 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.EnvLab), { ssr: false, loading });
const Activity13 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.FilesLab), { ssr: false, loading });
const Activity14 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.LogsLab), { ssr: false, loading });
const Activity15 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.PathsLab), { ssr: false, loading });
const Activity16 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.PermsLab), { ssr: false, loading });
const Activity17 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.PipesLab), { ssr: false, loading });
const Activity18 = dynamic<ActivityComponentProps>(() => import("../../content/courses/command-line/activities/labs").then((m) => m.ProcessLab), { ssr: false, loading });
const Activity19 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.HashLab), { ssr: false, loading });
const Activity20 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.QueueLab), { ssr: false, loading });
const Activity21 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.RouteLab), { ssr: false, loading });
const Activity22 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.SearchLab), { ssr: false, loading });
const Activity23 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.SortLab), { ssr: false, loading });
const Activity24 = dynamic<ActivityComponentProps>(() => import("../../content/courses/data-structures/activities/labs").then((m) => m.StructureLab), { ssr: false, loading });
const Activity25 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.BranchLab), { ssr: false, loading });
const Activity26 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.CommitLab), { ssr: false, loading });
const Activity27 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.HistoryLab), { ssr: false, loading });
const Activity28 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.IncidentLab), { ssr: false, loading });
const Activity29 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.MergeLab), { ssr: false, loading });
const Activity30 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.RemoteLab), { ssr: false, loading });
const Activity31 = dynamic<ActivityComponentProps>(() => import("../../content/courses/git-basics/activities/labs").then((m) => m.UndoLab), { ssr: false, loading });
const Activity32 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.ArrayLab), { ssr: false, loading });
const Activity33 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.CacheLab), { ssr: false, loading });
const Activity34 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.LoopLab), { ssr: false, loading });
const Activity35 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.ScheduleLab), { ssr: false, loading });
const Activity36 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.StackLab), { ssr: false, loading });
const Activity37 = dynamic<ActivityComponentProps>(() => import("../../content/courses/how-programs-run/activities/labs").then((m) => m.TraceLab), { ssr: false, loading });
const Activity38 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.CacheLab), { ssr: false, loading });
const Activity39 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.CookieLab), { ssr: false, loading });
const Activity40 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.DiagnosisLab), { ssr: false, loading });
const Activity41 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.FinalMission), { ssr: false, loading });
const Activity42 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.JsonLab), { ssr: false, loading });
const Activity43 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.MethodLab), { ssr: false, loading });
const Activity44 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.RequestLab), { ssr: false, loading });
const Activity45 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.ResponseLab), { ssr: false, loading });
const Activity46 = dynamic<ActivityComponentProps>(() => import("../../content/courses/http-hands-on/activities/labs").then((m) => m.UrlLab), { ssr: false, loading });
const Activity47 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.ArpLab), { ssr: false, loading });
const Activity48 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.DnsLab), { ssr: false, loading });
const Activity49 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.FirewallLab), { ssr: false, loading });
const Activity50 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.LaptopLab), { ssr: false, loading });
const Activity51 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.NatLab), { ssr: false, loading });
const Activity52 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.RouteLab), { ssr: false, loading });
const Activity53 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.SubnetLab), { ssr: false, loading });
const Activity54 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.TcpLab), { ssr: false, loading });
const Activity55 = dynamic<ActivityComponentProps>(() => import("../../content/courses/networking-basics/activities/labs").then((m) => m.TraceLab), { ssr: false, loading });

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
  "command-line/grep": Concept11,
  "command-line/move": Concept12,
  "command-line/path-lookup": Concept13,
  "command-line/paths": Concept14,
  "command-line/perms": Concept15,
  "command-line/pipe": Concept16,
  "command-line/shell": Concept17,
  "command-line/signal": Concept18,
  "command-line/unlink": Concept19,
  "data-structures/array-list": Concept20,
  "data-structures/bfs": Concept21,
  "data-structures/binary": Concept22,
  "data-structures/growth": Concept23,
  "data-structures/hash": Concept24,
  "data-structures/sort": Concept25,
  "data-structures/stack-queue": Concept26,
  "git-basics/areas": Concept27,
  "git-basics/branch": Concept28,
  "git-basics/log": Concept29,
  "git-basics/merge": Concept30,
  "git-basics/remote": Concept31,
  "git-basics/revert": Concept32,
  "git-basics/snapshot": Concept33,
  "git-basics/undo": Concept34,
  "how-programs-run/cache": Concept35,
  "how-programs-run/cycle": Concept36,
  "how-programs-run/jump": Concept37,
  "how-programs-run/memory": Concept38,
  "how-programs-run/parts": Concept39,
  "how-programs-run/schedule": Concept40,
  "how-programs-run/stack": Concept41,
  "http-hands-on/auth": Concept42,
  "http-hands-on/cache": Concept43,
  "http-hands-on/cookie": Concept44,
  "http-hands-on/journey": Concept45,
  "http-hands-on/message": Concept46,
  "http-hands-on/negotiation": Concept47,
  "http-hands-on/redirect": Concept48,
  "http-hands-on/retry": Concept49,
  "http-hands-on/tls": Concept50,
  "http-hands-on/url": Concept51,
  "networking-basics/arp": Concept52,
  "networking-basics/dns": Concept53,
  "networking-basics/nat": Concept54,
  "networking-basics/packets": Concept55,
  "networking-basics/ports": Concept56,
  "networking-basics/routing": Concept57,
  "networking-basics/subnet": Concept58,
  "networking-basics/tcp": Concept59,
  "networking-basics/traceroute": Concept60,
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
  "command-line/disk-lab": Activity11,
  "command-line/env-lab": Activity12,
  "command-line/files-lab": Activity13,
  "command-line/logs-lab": Activity14,
  "command-line/paths-lab": Activity15,
  "command-line/perms-lab": Activity16,
  "command-line/pipes-lab": Activity17,
  "command-line/process-lab": Activity18,
  "data-structures/hash-lab": Activity19,
  "data-structures/queue-lab": Activity20,
  "data-structures/route-lab": Activity21,
  "data-structures/search-lab": Activity22,
  "data-structures/sort-lab": Activity23,
  "data-structures/structure-lab": Activity24,
  "git-basics/branch-lab": Activity25,
  "git-basics/commit-lab": Activity26,
  "git-basics/history-lab": Activity27,
  "git-basics/incident-lab": Activity28,
  "git-basics/merge-lab": Activity29,
  "git-basics/remote-lab": Activity30,
  "git-basics/undo-lab": Activity31,
  "how-programs-run/array-lab": Activity32,
  "how-programs-run/cache-lab": Activity33,
  "how-programs-run/loop-lab": Activity34,
  "how-programs-run/schedule-lab": Activity35,
  "how-programs-run/stack-lab": Activity36,
  "how-programs-run/trace-lab": Activity37,
  "http-hands-on/cache-lab": Activity38,
  "http-hands-on/cookie-lab": Activity39,
  "http-hands-on/diagnosis-lab": Activity40,
  "http-hands-on/final-mission": Activity41,
  "http-hands-on/json-lab": Activity42,
  "http-hands-on/method-lab": Activity43,
  "http-hands-on/request-lab": Activity44,
  "http-hands-on/response-lab": Activity45,
  "http-hands-on/url-lab": Activity46,
  "networking-basics/arp-lab": Activity47,
  "networking-basics/dns-lab": Activity48,
  "networking-basics/firewall-lab": Activity49,
  "networking-basics/laptop-lab": Activity50,
  "networking-basics/nat-lab": Activity51,
  "networking-basics/route-lab": Activity52,
  "networking-basics/subnet-lab": Activity53,
  "networking-basics/tcp-lab": Activity54,
  "networking-basics/trace-lab": Activity55,
};
