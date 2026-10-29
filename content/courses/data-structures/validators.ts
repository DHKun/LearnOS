/** Server-side validators. Never imported by a client component. */
import {
  BUCKET_OPTIONS,
  SORT_JOBS,
  SORT_NAMES,
  TASKS,
  WORKLOADS,
  evaluateHash,
  evaluateQueues,
  evaluateSearch,
  evaluateSorts,
  evaluateStructures,
  gradePath,
  parseChoice,
  parseIndexes,
  parsePath,
  summary,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const verdict = (graded: { passed: boolean; message: string }): Verdict => ({ passed: graded.passed, feedback: { message: graded.message } });

export function validateSearchLab(input: unknown): Verdict {
  const raw = record(input);
  const present = parseIndexes(raw?.present);
  const absent = parseIndexes(raw?.absent);
  if (!present || !absent) return bad("查找记录的格式不正确。");
  return verdict(summary(evaluateSearch(present, absent).goals, "每次都看中间那本，一次排除一半：64 本书最多看 6 次。"));
}

export function validateStructureLab(input: unknown): Verdict {
  const choice = parseChoice(record(input)?.choice, WORKLOADS.map((item) => item.id), ["array", "list"] as const);
  if (!choice) return bad("选择不完整。");
  return verdict(summary(evaluateStructures(choice).goals, "按位置读多就用数组，在开头插入、删除多就用链表。"));
}

export function validateQueueLab(input: unknown): Verdict {
  const choice = parseChoice(record(input)?.choice, TASKS.map((item) => item.id), ["stack", "queue"] as const);
  if (!choice) return bad("选择不完整。");
  return verdict(summary(evaluateQueues(choice).goals, "先来先服务用队列，最近的先处理用栈。"));
}

export function validateHashLab(input: unknown): Verdict {
  const raw = record(record(input)?.choice);
  const fn = raw?.fn;
  const buckets = raw?.buckets;
  if ((fn !== "last-digit" && fn !== "first-two" && fn !== "modulo") || !BUCKET_OPTIONS.includes(buckets as (typeof BUCKET_OPTIONS)[number])) return bad("选择不完整。");
  return verdict(summary(evaluateHash({ fn, buckets: buckets as (typeof BUCKET_OPTIONS)[number] }).goals, "用整个号码对一个质数取余，200 个号码均匀地落进了 97 个格子。"));
}

export function validateSortLab(input: unknown): Verdict {
  const choice = parseChoice(record(input)?.choice, SORT_JOBS.map((item) => item.id), SORT_NAMES.map((item) => item.id));
  if (!choice) return bad("选择不完整。");
  return verdict(summary(evaluateSorts(choice).goals, "没有哪种排序永远最好：几乎有序用插入排序，要稳定又要快用归并排序。"));
}

export function validateRouteLab(input: unknown): Verdict {
  const path = parsePath(record(input)?.path);
  if (!path) return bad("路线的格式不正确。");
  return verdict(gradePath(path));
}
