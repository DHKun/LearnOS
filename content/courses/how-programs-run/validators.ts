/** Server-side validators. Never imported by a client component. */
import {
  TRACE_QUESTIONS,
  type TraceQuestionId,
  gradeArray,
  gradeCache,
  gradeSchedule,
  gradeStack,
  gradeSum,
  gradeTrace,
  parseCacheChoice,
  parsePolicy,
  parseSource,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Assembles and runs the submitted program on the machine, then checks the outcome. */
function program(input: unknown, grade: (source: string) => { passed: boolean; message: string }): Verdict {
  const source = parseSource(record(input)?.source);
  if (source === null) return bad("没有收到程序。");
  const graded = grade(source);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateTraceLab(input: unknown): Verdict {
  const raw = record(record(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers = Object.fromEntries(TRACE_QUESTIONS.map((item) => [item.id, typeof raw[item.id] === "string" ? (raw[item.id] as string).slice(0, 20) : ""])) as Record<TraceQuestionId, string>;
  const graded = gradeTrace(answers);
  return { passed: graded.passed, feedback: { message: graded.passed ? "四个问题都答对了。" : `答对了 ${graded.correct}/${graded.total} 个。${graded.hints.join("")}` } };
}

export const validateLoopLab = (input: unknown) => program(input, gradeSum);
export const validateArrayLab = (input: unknown) => program(input, gradeArray);
export const validateStackLab = (input: unknown) => program(input, gradeStack);

export function validateCacheLab(input: unknown): Verdict {
  const choice = parseCacheChoice(record(input)?.choice);
  if (!choice) return bad("选择不完整。");
  const graded = gradeCache(choice);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateScheduleLab(input: unknown): Verdict {
  const policy = parsePolicy(record(input)?.policy);
  if (!policy) return bad("调度策略不完整。");
  const graded = gradeSchedule(policy);
  return { passed: graded.passed, feedback: { message: graded.message } };
}
