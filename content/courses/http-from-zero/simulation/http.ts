export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequest = {
  method: HttpMethod;
  path: string;
};

export type HttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

const USERS: Record<string, { id: number; name: string }> = {
  "1": { id: 1, name: "小明" },
  "2": { id: 2, name: "小红" },
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
};

/** Deterministic browser-side HTTP simulator. No real network is used. */
export function simulateHttpRequest(request: HttpRequest): HttpResponse {
  const path = request.path.trim() || "/";
  const method = request.method;

  if (method === "GET" && path === "/") {
    return {
      status: 200,
      statusText: STATUS_TEXT[200],
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<h1>LearnOS HTTP 示例站</h1><p>GET /users/1 查看用户</p>",
    };
  }

  if (method === "GET" && path.startsWith("/users/")) {
    const id = path.slice("/users/".length);
    const user = USERS[id];
    if (!user) {
      return {
        status: 404,
        statusText: STATUS_TEXT[404],
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "user_not_found", id }),
      };
    }
    return {
      status: 200,
      statusText: STATUS_TEXT[200],
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user),
    };
  }

  if (method === "POST" && path === "/users") {
    return {
      status: 201,
      statusText: STATUS_TEXT[201],
      headers: { "content-type": "application/json", location: "/users/3" },
      body: JSON.stringify({ id: 3, name: "新用户" }),
    };
  }

  if (method === "DELETE" && path.startsWith("/users/")) {
    const id = path.slice("/users/".length);
    return USERS[id]
      ? {
          status: 204,
          statusText: STATUS_TEXT[204],
          headers: {},
          body: "",
        }
      : {
          status: 404,
          statusText: STATUS_TEXT[404],
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "user_not_found", id }),
        };
  }

  if (method === "PUT" && path.startsWith("/users/")) {
    return {
      status: 200,
      statusText: STATUS_TEXT[200],
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: Number(path.slice("/users/".length)), name: "替换后的用户" }),
    };
  }

  if (path.startsWith("/users") && method === "PATCH") {
    return {
      status: 405,
      statusText: STATUS_TEXT[405],
      headers: { allow: "GET, POST, PUT, DELETE" },
      body: JSON.stringify({ error: "method_not_allowed" }),
    };
  }

  return {
    status: 404,
    statusText: STATUS_TEXT[404],
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: "not_found", path }),
  };
}

export function requestLine(request: HttpRequest): string {
  const path = request.path.trim() || "/";
  return `${request.method} ${path} HTTP/1.1`;
}

export function requestText(request: HttpRequest): string {
  return `${requestLine(request)}\r\nHost: example.test\r\nAccept: application/json`;
}

export function responseText(response: HttpResponse): string {
  const headers = Object.entries(response.headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\r\n");
  return `HTTP/1.1 ${response.status} ${response.statusText}${headers ? `\r\n${headers}` : ""}${
    response.body ? `\r\n\r\n${response.body}` : ""
  }`;
}

export type MethodScenario = {
  id: string;
  title: string;
  description: string;
  correct: HttpMethod;
};

export const METHOD_SCENARIOS: MethodScenario[] = [
  {
    id: "read-user",
    title: "读取 /users/1",
    description: "只获取用户信息，不修改任何数据。",
    correct: "GET",
  },
  {
    id: "create-user",
    title: "创建一位新用户",
    description: "在 /users 下新增资源，服务器分配新 ID。",
    correct: "POST",
  },
  {
    id: "replace-user",
    title: "整体替换 /users/1",
    description: "用一份完整的新表示替换原资源。",
    correct: "PUT",
  },
  {
    id: "delete-user",
    title: "删除 /users/1",
    description: "移除资源，成功时没有响应体。",
    correct: "DELETE",
  },
];

export type MethodAnswers = Record<string, string>;

export function gradeMethodAnswers(answers: MethodAnswers): {
  passed: boolean;
  correct: number;
  total: number;
  details: { id: string; expected: HttpMethod; given: string; correct: boolean }[];
} {
  const details = METHOD_SCENARIOS.map((scenario) => {
    const given = answers[scenario.id] ?? "";
    return {
      id: scenario.id,
      expected: scenario.correct,
      given,
      correct: given === scenario.correct,
    };
  });
  const correct = details.filter((item) => item.correct).length;
  return { passed: correct === details.length, correct, total: details.length, details };
}

export type CookieConfig = {
  setCookie: boolean;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict" | "None";
  path: string;
};

export function cookieFlow(config: CookieConfig): {
  responseHeaders: Record<string, string>;
  nextRequestHeaders: Record<string, string>;
  sent: boolean;
  reason: string;
} {
  const responseHeaders: Record<string, string> = {};
  if (config.setCookie) {
    responseHeaders["set-cookie"] = `session=demo-session; Path=${config.path || "/"}; SameSite=${config.sameSite}${
      config.httpOnly ? "; HttpOnly" : ""
    }`;
  }
  const sent = config.setCookie && (config.path === "/" || config.path === "");
  return {
    responseHeaders,
    nextRequestHeaders: sent ? { cookie: "session=demo-session" } : {},
    sent,
    reason: !config.setCookie
      ? "服务器没有返回 Set-Cookie，浏览器没有可保存的会话。"
      : !sent
        ? `Cookie 的 Path=${config.path || "/"} 不匹配当前请求 /account，浏览器不会自动携带。`
        : config.httpOnly
          ? "浏览器保存 Cookie，并在后续同站请求中自动携带；HttpOnly 只禁止 JS 读取，不影响自动发送。"
          : "浏览器保存 Cookie 并在后续请求中携带；但 JS 也能读取它，存在 XSS 风险。",
  };
}
