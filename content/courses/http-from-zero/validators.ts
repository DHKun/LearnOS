import {
  cookieFlow,
  gradeMethodAnswers,
  simulateHttpRequest,
  type CookieConfig,
  type HttpMethod,
  type MethodAnswers,
} from "./simulation/http";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function isMethod(value: unknown): value is HttpMethod {
  return typeof value === "string" && METHODS.includes(value as HttpMethod);
}

export function validateRequestBuilder(submission: unknown): {
  passed: boolean;
  feedback: Record<string, unknown>;
} {
  const raw = submission as { method?: unknown; path?: unknown } | null;
  const method = isMethod(raw?.method) ? raw.method : "GET";
  const path = typeof raw?.path === "string" ? raw.path.trim() : "";
  const response = simulateHttpRequest({ method, path });
  const passed = method === "GET" && path === "/users/1" && response.status === 200;
  return {
    passed,
    feedback: {
      expected: "GET /users/1 → 200",
      request: `${method} ${path || "/"}`,
      response,
      message: passed
        ? "请求构造正确：GET /users/1 返回 200 和用户 JSON。"
        : "这个请求没有完成目标任务。目标是用 GET 读取 /users/1，并得到 200 响应。",
    },
  };
}

export function validateMethodMatch(submission: unknown): {
  passed: boolean;
  feedback: Record<string, unknown>;
} {
  const raw = submission as { answers?: unknown } | null;
  const answers =
    raw?.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)
      ? (raw.answers as MethodAnswers)
      : {};
  const graded = gradeMethodAnswers(answers);
  return {
    passed: graded.passed,
    feedback: {
      correct: graded.correct,
      total: graded.total,
      details: graded.details,
      message: graded.passed
        ? "四种场景的语义与方法全部匹配。"
        : `答对 ${graded.correct} / ${graded.total}；注意读取、创建、整体替换和删除的语义差异。`,
    },
  };
}

export function validateCookieLab(submission: unknown): {
  passed: boolean;
  feedback: Record<string, unknown>;
} {
  const raw = submission as Partial<CookieConfig> | null;
  const config: CookieConfig = {
    setCookie: raw?.setCookie === true,
    httpOnly: raw?.httpOnly === true,
    sameSite:
      raw?.sameSite === "Strict" || raw?.sameSite === "None" ? raw.sameSite : "Lax",
    path: typeof raw?.path === "string" && raw.path ? raw.path : "/",
  };
  const flow = cookieFlow(config);
  const passed =
    config.setCookie &&
    config.httpOnly &&
    config.sameSite !== "None" &&
    (config.path === "/" || config.path === "/account");
  return {
    passed,
    feedback: {
      ...config,
      ...flow,
      message: passed
        ? "会话 Cookie 设置正确：浏览器保存并在后续请求中携带，HttpOnly 降低 XSS 读取风险。"
        : "还没有配置出可靠的会话 Cookie：需要 Set-Cookie、HttpOnly、合适的 SameSite，以及能匹配当前路径的 Path。",
    },
  };
}
