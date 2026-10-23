"use client";

import * as React from "react";
import { CheckCircle2, FlaskConical, ShieldCheck, XCircle } from "lucide-react";

import { ActivitySaveStatus } from "@/components/activities/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLearning } from "@/lib/learning/context";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps, LearningState } from "@/lib/learning/types";
import {
  METHOD_SCENARIOS,
  cookieFlow,
  requestText,
  responseText,
  simulateHttpRequest,
  type CookieConfig,
  type HttpMethod,
} from "../simulation/http";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function Feedback({
  passed,
  message,
}: {
  passed: boolean;
  message: string;
}) {
  return (
    <div
      className={
        passed
          ? "rounded-lg border border-success/40 bg-success/10 p-3 text-sm"
          : "rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
      }
      role="status"
    >
      <p className="flex items-center gap-2 font-medium">
        {passed ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <XCircle className="size-4 text-destructive" />
        )}
        {passed ? "服务端验证通过" : "服务端未通过"}
      </p>
      <p className="mt-1 text-muted-foreground">{message}</p>
    </div>
  );
}

type RequestState = {
  method: HttpMethod;
  path: string;
  ran: boolean;
  passed: boolean;
} & LearningState;

const REQUEST_INITIAL: RequestState = {
  method: "GET",
  path: "/users/1",
  ran: false,
  passed: false,
};

function normalizeRequest(value: unknown): RequestState {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    method:
      typeof raw.method === "string" && METHODS.includes(raw.method as HttpMethod)
        ? (raw.method as HttpMethod)
        : "GET",
    path: typeof raw.path === "string" ? raw.path.slice(0, 200) : "/users/1",
    ran: raw.ran === true,
    passed: raw.passed === true,
  };
}

export function RequestBuilderActivity({ readOnly }: ActivityComponentProps) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } =
    useActivityState<RequestState>(REQUEST_INITIAL, normalizeRequest);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [serverPassed, setServerPassed] = React.useState(state.passed);
  const response = simulateHttpRequest({ method: state.method, path: state.path });

  function update(patch: Partial<RequestState>) {
    if (readOnly) return;
    setState({ ...state, ...patch, ran: false });
  }

  async function submit() {
    if (readOnly || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await sdk.submit({ method: state.method, path: state.path });
      setServerPassed(result.passed);
      setMessage(
        typeof result.feedback?.message === "string"
          ? result.feedback.message
          : result.passed
            ? "请求符合目标。"
            : "请求不符合目标。",
      );
      if (result.passed) {
        setState({ ...state, ran: true, passed: true });
        sdk.track("request_builder_passed", { method: state.method, path: state.path });
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="http-request-builder">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" /> JS 模拟实验
          </Badge>
          <Badge variant="outline">浏览器内确定性模拟</Badge>
          {serverPassed && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="size-3" /> 已验证
            </Badge>
          )}
        </div>
        <ActivitySaveStatus
          status={status}
          error={error}
          conflict={conflict}
          onReload={() => void reload()}
        />
      </div>

      <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium">任务</p>
        <p className="mt-1 text-muted-foreground">
          构造一条读取用户 1 的请求：方法 <code>GET</code>，路径 <code>/users/1</code>，
          并观察 200 响应。模拟完全在浏览器内运行，不发送真实网络请求；正式通过由服务端重新计算。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">请求</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((method) => (
                <Button
                  key={method}
                  type="button"
                  size="sm"
                  variant={state.method === method ? "default" : "outline"}
                  disabled={readOnly}
                  onClick={() => update({ method })}
                >
                  {method}
                </Button>
              ))}
            </div>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="http-path">
              路径
            </label>
            <input
              id="http-path"
              value={state.path}
              disabled={readOnly}
              onChange={(event) => update({ path: event.target.value })}
              className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => update({ ran: true })} disabled={readOnly}>
              运行模拟
            </Button>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100">
              {requestText({ method: state.method, path: state.path })}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">响应</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={
                  response.status < 300
                    ? "rounded-full bg-success/15 px-2 py-1 font-mono text-success"
                    : "rounded-full bg-destructive/10 px-2 py-1 font-mono text-destructive"
                }
              >
                {response.status}
              </span>
              <span className="text-muted-foreground">{response.statusText}</span>
            </div>
            <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100">
              {responseText(response)}
            </pre>
            <p className="text-xs text-muted-foreground">
              修改方法或路径会立即改变模拟结果；这只改变本地预览，不会自动提交成绩。
            </p>
          </CardContent>
        </Card>
      </div>

      {message && <Feedback passed={serverPassed} message={message} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void submit()} disabled={readOnly || pending || serverPassed}>
          {pending ? "正在提交…" : serverPassed ? "实验已通过" : "提交实验结论"}
        </Button>
        <span className="text-xs text-muted-foreground">只有提交后服务端验证器才会判定正式通过。</span>
      </div>
    </div>
  );
}

type MethodState = {
  answers: Record<string, string>;
  passed: boolean;
} & LearningState;

const METHOD_INITIAL: MethodState = { answers: {}, passed: false };

function normalizeMethod(value: unknown): MethodState {
  const raw = (value ?? {}) as Record<string, unknown>;
  const answers =
    raw.answers && typeof raw.answers === "object" && !Array.isArray(raw.answers)
      ? Object.fromEntries(
          Object.entries(raw.answers as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && METHODS.includes(entry[1] as HttpMethod),
          ),
        )
      : {};
  return { answers, passed: raw.passed === true };
}

export function MethodMatchActivity({ readOnly }: ActivityComponentProps) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } = useActivityState<MethodState>(
    METHOD_INITIAL,
    normalizeMethod,
  );
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [passed, setPassed] = React.useState(state.passed);
  const answered = METHOD_SCENARIOS.filter((scenario) => state.answers[scenario.id]).length;

  async function submit() {
    if (readOnly || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await sdk.submit({ answers: state.answers });
      setPassed(result.passed);
      setMessage(
        typeof result.feedback?.message === "string"
          ? result.feedback.message
          : result.passed
            ? "方法选择正确。"
            : "方法选择有误。",
      );
      if (result.passed) {
        setState({ ...state, passed: true });
        sdk.track("method_match_passed", { answers: state.answers });
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="http-method-match">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" /> 方法匹配
          </Badge>
          {passed && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="size-3" /> 已验证
            </Badge>
          )}
        </div>
        <ActivitySaveStatus
          status={status}
          error={error}
          conflict={conflict}
          onReload={() => void reload()}
        />
      </div>

      <div className="space-y-3">
        {METHOD_SCENARIOS.map((scenario) => (
          <div key={scenario.id} className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{scenario.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{scenario.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {METHODS.map((method) => (
                <Button
                  key={method}
                  type="button"
                  size="sm"
                  variant={state.answers[scenario.id] === method ? "default" : "outline"}
                  disabled={readOnly || passed}
                  onClick={() =>
                    setState({
                      ...state,
                      answers: { ...state.answers, [scenario.id]: method },
                    })
                  }
                >
                  {method}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {message && <Feedback passed={passed} message={message} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={readOnly || pending || passed || answered < METHOD_SCENARIOS.length}
        >
          {pending ? "正在提交…" : passed ? "实验已通过" : "提交方法匹配"}
        </Button>
        <span className="text-xs text-muted-foreground">
          已作答 {answered} / {METHOD_SCENARIOS.length}
        </span>
      </div>
    </div>
  );
}

type CookieState = CookieConfig & { passed: boolean } & LearningState;

const COOKIE_INITIAL: CookieState = {
  setCookie: false,
  httpOnly: false,
  sameSite: "Lax",
  path: "/",
  passed: false,
};

function normalizeCookie(value: unknown): CookieState {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    setCookie: raw.setCookie === true,
    httpOnly: raw.httpOnly === true,
    sameSite:
      raw.sameSite === "Strict" || raw.sameSite === "None" ? raw.sameSite : "Lax",
    path: typeof raw.path === "string" ? raw.path.slice(0, 80) : "/",
    passed: raw.passed === true,
  };
}

export function CookieLabActivity({ readOnly }: ActivityComponentProps) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } = useActivityState<CookieState>(
    COOKIE_INITIAL,
    normalizeCookie,
  );
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [passed, setPassed] = React.useState(state.passed);
  const flow = cookieFlow(state);

  function update(patch: Partial<CookieState>) {
    if (readOnly || passed) return;
    setState({ ...state, ...patch });
  }

  async function submit() {
    if (readOnly || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await sdk.submit({
        setCookie: state.setCookie,
        httpOnly: state.httpOnly,
        sameSite: state.sameSite,
        path: state.path,
      });
      setPassed(result.passed);
      setMessage(
        typeof result.feedback?.message === "string"
          ? result.feedback.message
          : result.passed
            ? "Cookie 配置正确。"
            : "Cookie 配置还不完整。",
      );
      if (result.passed) {
        setState({ ...state, passed: true });
        sdk.track("cookie_lab_passed", { sameSite: state.sameSite });
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="http-cookie-lab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" /> Cookie 实验
          </Badge>
          {passed && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="size-3" /> 已验证
            </Badge>
          )}
        </div>
        <ActivitySaveStatus
          status={status}
          error={error}
          conflict={conflict}
          onReload={() => void reload()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.setCookie}
              disabled={readOnly || passed}
              onChange={() => update({ setCookie: !state.setCookie })}
            />
            登录响应返回 Set-Cookie
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.httpOnly}
              disabled={readOnly || passed}
              onChange={() => update({ httpOnly: !state.httpOnly })}
            />
            HttpOnly
          </label>
          <label className="block text-sm">
            SameSite
            <select
              value={state.sameSite}
              disabled={readOnly || passed}
              onChange={(event) => update({ sameSite: event.target.value as CookieConfig["sameSite"] })}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="Lax">Lax</option>
              <option value="Strict">Strict</option>
              <option value="None">None</option>
            </select>
          </label>
          <label className="block text-sm">
            Path
            <input
              value={state.path}
              disabled={readOnly || passed}
              onChange={(event) => update({ path: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-sm"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-border p-3 text-xs">
            <p className="font-medium">响应 Header</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono">
              {Object.entries(flow.responseHeaders)
                .map(([name, value]) => `${name}: ${value}`)
                .join("\n") || "（没有 Set-Cookie）"}
            </pre>
          </div>
          <div className="rounded-lg border border-border p-3 text-xs">
            <p className="font-medium">下一次请求 Header</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono">
              {Object.entries(flow.nextRequestHeaders)
                .map(([name, value]) => `${name}: ${value}`)
                .join("\n") || "（不会携带 Cookie）"}
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">{flow.reason}</p>
        </div>
      </div>

      {message && <Feedback passed={passed} message={message} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void submit()} disabled={readOnly || pending || passed}>
          {pending ? "正在提交…" : passed ? "实验已通过" : "提交 Cookie 配置"}
        </Button>
        <span className="text-xs text-muted-foreground">正式通过由服务端重新计算。</span>
      </div>
    </div>
  );
}
