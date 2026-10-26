/** Server-side validators. Never imported by a client component. */
import { LIMITS, METHODS, asRecord, parseHistory, parseLabRequest } from "./simulation/http";
import {
  CACHE_POLICIES,
  CACHE_RESOURCES,
  COOKIE_PATHS,
  type CacheConfig,
  type CachePolicy,
  type CookieConfig,
  DIAGNOSIS_OPTIONS,
  DIAGNOSIS_REQUESTS,
  RESPONSE_CASES,
  type ResponseAnswers,
  URL_TASKS,
  evaluateCookie,
  gradeDiagnosis,
  gradeJsonLab,
  gradeMethodLab,
  gradeMission,
  gradeRequestLab,
  gradeResponseLab,
  gradeUrlTask,
  simulateCache,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function shortString(value: unknown, max = 200): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

export function validateUrlLab(input: unknown): Verdict {
  const urls = asRecord(asRecord(input)?.urls);
  if (!urls) return bad("提交内容缺少 urls。");
  const results = URL_TASKS.map((task) => {
    const url = shortString(urls[task.id], LIMITS.url);
    return url ? gradeUrlTask(task.id, url) : { passed: false, message: "缺少这个任务的 URL。" };
  });
  const passed = results.every((item) => item.passed);
  return {
    passed,
    feedback: {
      results: results.map((item) => item.passed),
      message: passed ? "两条链接都修好了。" : (results.find((item) => !item.passed)?.message ?? "还有链接没修好。"),
    },
  };
}

export function validateRequestLab(input: unknown): Verdict {
  const request = parseLabRequest(input);
  if (!request) return bad("请求格式不正确。");
  const graded = gradeRequestLab(request);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateResponseLab(input: unknown): Verdict {
  const raw = asRecord(asRecord(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers: ResponseAnswers = {};
  for (const item of RESPONSE_CASES) {
    const value = raw[item.id];
    if (Array.isArray(value)) {
      if (value.length <= METHODS.length && value.every((entry) => METHODS.includes(entry))) answers[item.id] = value as string[];
    } else {
      const text = shortString(value);
      if (text !== undefined) answers[item.id] = text;
    }
  }
  const graded = gradeResponseLab(answers);
  return {
    passed: graded.passed,
    feedback: {
      results: graded.results,
      correct: graded.correct,
      total: graded.total,
      message: graded.passed ? "五份响应都读懂了。" : `读对了 ${graded.correct}/${graded.total} 份。答案都写在响应的状态行、头部或正文里。`,
    },
  };
}

export function validateMethodLab(input: unknown): Verdict {
  const history = parseHistory(asRecord(input)?.history);
  if (!history) return bad("请求记录格式不正确。");
  const graded = gradeMethodLab(history);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export function validateJsonLab(input: unknown): Verdict {
  const request = parseLabRequest(input);
  if (!request) return bad("请求格式不正确。");
  const graded = gradeJsonLab(request);
  return { passed: graded.passed, feedback: { status: graded.status, message: graded.message } };
}

export function validateCookieLab(input: unknown): Verdict {
  const raw = asRecord(input);
  if (!raw) return bad("Cookie 配置无效。");
  if (!COOKIE_PATHS.includes(raw.path as CookieConfig["path"])) return bad("Path 不合法。");
  if (!["Strict", "Lax", "None"].includes(raw.sameSite as string)) return bad("SameSite 不合法。");
  const config: CookieConfig = {
    path: raw.path as CookieConfig["path"],
    secure: raw.secure === true,
    httpOnly: raw.httpOnly === true,
    sameSite: raw.sameSite as CookieConfig["sameSite"],
  };
  const result = evaluateCookie(config);
  const failed = result.outcomes.filter((item) => !item.ok);
  return {
    passed: result.passed,
    feedback: {
      results: result.outcomes.map((item) => item.ok),
      message: result.passed ? "五个场景全部符合预期：会话可用，又不会被跨站请求、脚本或明文网络带走。" : `还有 ${failed.length} 个场景不符合预期：${failed[0].detail}`,
    },
  };
}

export function validateCacheLab(input: unknown): Verdict {
  const raw = asRecord(input);
  if (!raw) return bad("缓存配置无效。");
  const config = {} as CacheConfig;
  for (const { id } of CACHE_RESOURCES) {
    if (!CACHE_POLICIES.includes(raw[id] as CachePolicy)) return bad(`${id} 的缓存策略不合法。`);
    config[id] = raw[id] as CachePolicy;
  }
  const result = simulateCache(config);
  const failed = result.goals.filter((goal) => !goal.ok);
  return {
    passed: result.passed,
    feedback: {
      goals: result.goals.map((goal) => goal.ok),
      message: result.passed ? "四个目标全部达成。" : `未达成：${failed.map((goal) => goal.label).join("；")}。`,
    },
  };
}

export function validateDiagnosisLab(input: unknown): Verdict {
  const raw = asRecord(input);
  const answersRaw = asRecord(raw?.answers);
  if (!raw || !answersRaw) return bad("诊断报告格式不正确。");
  const allowed = new Set<string>(DIAGNOSIS_OPTIONS.map((item) => item.id));
  const answers: Record<string, string> = {};
  for (const item of DIAGNOSIS_REQUESTS) {
    const value = answersRaw[item.id];
    if (typeof value === "string" && allowed.has(value)) answers[item.id] = value;
  }
  const root = shortString(raw.root, 40);
  const graded = gradeDiagnosis(answers, root);
  return {
    passed: graded.passed,
    feedback: {
      correct: graded.correct,
      total: graded.total,
      rootOk: graded.rootOk,
      message: graded.passed
        ? "诊断完全正确：真正的故障是会话 Cookie 的 Path 太窄，/api/loans 没带上会话。"
        : `判断对了 ${graded.correct}/${graded.total} 条${graded.rootOk ? "" : "，根因还没找对"}。${graded.hint}`,
    },
  };
}

export function validateFinalMission(input: unknown): Verdict {
  const history = parseHistory(asRecord(input)?.history);
  if (!history) return bad("请求记录格式不正确。");
  const graded = gradeMission(history);
  return { passed: graded.passed, feedback: { message: graded.message } };
}
