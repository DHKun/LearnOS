"use client";

import * as React from "react";
import { Globe } from "lucide-react";

import { LabFooter, Ticket, Verdict, useLabSubmit } from "@/components/education/lab-kit";
import { Button } from "@/components/ui/button";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";
import { cn } from "@/lib/utils";

import { METHODS, asRecord } from "../simulation/http";
import {
  CACHE_INITIAL,
  CACHE_POLICIES,
  CACHE_RESOURCES,
  CACHE_TIMELINE,
  COOKIE_INITIAL,
  COOKIE_PATHS,
  COOKIE_SCENARIOS,
  type CacheCell,
  type CacheConfig,
  type CachePolicy,
  type CookieConfig,
  DIAGNOSIS_OPTIONS,
  DIAGNOSIS_PAGE,
  DIAGNOSIS_REQUESTS,
  JSON_LAB,
  METHOD_LAB,
  MISSION,
  REQUEST_LAB,
  RESPONSE_CASES,
  type ResponseAnswers,
  URL_TASKS,
  type UrlTaskId,
  evaluateCookie,
  getRequest,
  gradeUrlTask,
  setCookieLine,
  simulateCache,
} from "../simulation/labs";
import { type World, browserSend, createWorld, parseUrl, publicBook } from "../simulation/library";
import {
  ExchangeView,
  MessageText,
  NetworkList,
  Workbench,
  type WorkbenchState,
  normalizeWorkbench,
} from "./kit";

const selectClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm";

// ---------------------------------------------------------------------------
// Ch2 · URL lab
// ---------------------------------------------------------------------------

type UrlState = { urls: Record<UrlTaskId, string>; opened: Record<UrlTaskId, boolean>; passed: boolean };
const URL_INITIAL: UrlState = {
  urls: { page: URL_TASKS[0].initial, port: URL_TASKS[1].initial },
  opened: { page: false, port: false },
  passed: false,
};
function normalizeUrl(value: unknown): UrlState {
  const record = asRecord(value) ?? {};
  const urls = asRecord(record.urls) ?? {};
  const opened = asRecord(record.opened) ?? {};
  const text = (key: UrlTaskId) => (typeof urls[key] === "string" ? String(urls[key]).slice(0, 500) : URL_INITIAL.urls[key]);
  return {
    urls: { page: text("page"), port: text("port") },
    opened: { page: opened.page === true, port: opened.port === true },
    passed: record.passed === true,
  };
}

function UrlParts({ url }: { url: string }) {
  const parsed = parseUrl(url);
  if (!parsed) return <p className="text-sm text-destructive">无法解析这个 URL。</p>;
  const parts = [
    { label: "方案", value: `${parsed.scheme}://`, sent: "决定用 HTTP 还是 HTTPS" },
    { label: "主机", value: parsed.host, sent: "进 Host 头，也用于 DNS 查询" },
    { label: "端口", value: parsed.port ? `:${parsed.port}` : "（默认 443）", sent: "决定连到哪个端口" },
    { label: "路径", value: parsed.path, sent: "进请求行" },
    { label: "查询", value: parsed.query || "（无）", sent: "进请求行" },
    { label: "片段", value: parsed.fragment || "（无）", sent: "不发送，只留在浏览器" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((part) => (
        <div
          key={part.label}
          className={cn(
            "min-w-0 rounded-md border px-2.5 py-1.5",
            part.label === "片段" && parsed.fragment ? "border-warning/60 bg-warning/10" : "border-border bg-muted/40",
          )}
        >
          <p className="text-[11px] text-muted-foreground">{part.label}</p>
          <code className="break-all text-xs">{decodeURIComponent(part.value)}</code>
          <p className="text-[11px] text-muted-foreground">{part.sent}</p>
        </div>
      ))}
    </div>
  );
}

export function UrlLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<UrlState>(URL_INITIAL, normalizeUrl);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-5" data-testid="http-hands-on-url">
      {URL_TASKS.map((task, index) => {
        const url = state.urls[task.id];
        const result = state.opened[task.id] ? browserSend(createWorld(), getRequest(url)) : null;
        const graded = state.opened[task.id] ? gradeUrlTask(task.id, url) : null;
        return (
          <section key={task.id} className="space-y-3 rounded-xl border border-border p-4">
            <Ticket goal={task.goal}>
              <strong>任务 {index + 1}：</strong>
              {task.ticket}
            </Ticket>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3">
                <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  aria-label={`任务 ${index + 1} 地址栏`}
                  disabled={locked}
                  value={url}
                  spellCheck={false}
                  maxLength={500}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      urls: { ...current.urls, [task.id]: event.target.value },
                      opened: { ...current.opened, [task.id]: false },
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={locked}
                onClick={() => setState((current) => ({ ...current, opened: { ...current.opened, [task.id]: true } }))}
              >
                打开
              </Button>
            </div>
            <UrlParts url={url} />
            {result && graded && (
              <>
                <ExchangeView result={result} />
                {!result.error && <Verdict ok={graded.passed}>{graded.message}</Verdict>}
              </>
            )}
          </section>
        );
      })}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交两条修好的链接"
        last={last}
        onSubmit={() =>
          void submit({ urls: state.urls }, "http_url_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch3 · Request lab
// ---------------------------------------------------------------------------

const RECORDED_PAGE = [
  getRequest("/books/detail.html?title=HTTP 从入门到排错"),
  REQUEST_LAB.broken,
];

function RecordedPage({ requests, title }: { requests: typeof RECORDED_PAGE; title: string }) {
  const [selected, setSelected] = React.useState<number>(requests.length - 1);
  const results = React.useMemo(() => requests.map((request) => browserSend(createWorld(), request)), [requests]);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold">{title}</p>
      <NetworkList
        rows={requests.map((request, index) => ({
          key: index,
          method: request.method,
          name: decodeURIComponent(request.url),
          status: results[index].response?.status ?? null,
        }))}
        selected={selected}
        onSelect={(key) => setSelected(Number(key))}
      />
      <ExchangeView result={results[selected]} />
    </div>
  );
}

const REQUEST_WB_INITIAL: WorkbenchState = { draft: { ...REQUEST_LAB.broken }, history: [], selected: null, passed: false };
const normalizeRequestWb = (value: unknown) => normalizeWorkbench(value, REQUEST_WB_INITIAL);

export function RequestLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<WorkbenchState>(REQUEST_WB_INITIAL, normalizeRequestWb);
  const { submit, pending, last } = useLabSubmit();
  const chosen = state.selected !== null ? state.history[state.selected] : null;
  return (
    <div className="space-y-5" data-testid="http-hands-on-request">
      <Ticket goal={<>用一个 GET 请求读到《{REQUEST_LAB.targetTitle}》的详情（200），然后提交这个请求。</>}>
        {REQUEST_LAB.ticket}下面是打开详情页时浏览器记录的请求。
      </Ticket>
      <RecordedPage requests={RECORDED_PAGE} title="详情页的 Network 记录" />
      <div className="space-y-2">
        <p className="text-sm font-semibold">你的请求工作台</p>
        <p className="text-sm text-muted-foreground">提示：图书列表接口 /api/books 支持 ?q= 搜索书名。</p>
        <Workbench id="请求实验" state={state} setState={setState} readOnly={readOnly} />
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        disabled={!chosen}
        label={chosen ? "提交选中的请求" : "先发送并选中一个请求"}
        last={last}
        onSubmit={() =>
          chosen &&
          void submit(chosen, "http_request_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch4 · Response lab
// ---------------------------------------------------------------------------

type ResponseState = { answers: ResponseAnswers; passed: boolean };
const RESPONSE_INITIAL: ResponseState = { answers: {}, passed: false };
function normalizeResponse(value: unknown): ResponseState {
  const record = asRecord(value) ?? {};
  const raw = asRecord(record.answers) ?? {};
  const answers: ResponseAnswers = {};
  for (const item of RESPONSE_CASES) {
    const entry = raw[item.id];
    if (typeof entry === "string") answers[item.id] = entry.slice(0, 200);
    if (Array.isArray(entry)) answers[item.id] = entry.filter((method): method is string => METHODS.includes(method));
  }
  return { answers, passed: record.passed === true };
}

export function ResponseLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<ResponseState>(RESPONSE_INITIAL, normalizeResponse);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const set = (id: string, value: string | string[]) =>
    setState((current) => ({ ...current, answers: { ...current.answers, [id]: value } }));
  return (
    <div className="space-y-4" data-testid="http-hands-on-response">
      <p className="text-sm">每一题的答案都写在响应里：状态行、某个头部，或者正文。不需要背，只需要读。</p>
      {RESPONSE_CASES.map((item, index) => {
        const answer = state.answers[item.id];
        return (
          <section key={item.id} className="space-y-2 rounded-xl border border-border p-4">
            <p className="text-sm">
              <strong>{index + 1}. </strong>
              {item.context}
            </p>
            <MessageText text={item.raw} />
            <p className="text-sm font-medium">{item.question}</p>
            {item.kind === "methods" ? (
              <div className="flex flex-wrap gap-3">
                {METHODS.map((method) => {
                  const list = Array.isArray(answer) ? answer : [];
                  return (
                    <label key={method} className="flex items-center gap-1.5 font-mono text-sm">
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={list.includes(method)}
                        onChange={(event) => set(item.id, event.target.checked ? [...list, method] : list.filter((entry) => entry !== method))}
                      />
                      {method}
                    </label>
                  );
                })}
              </div>
            ) : item.kind === "choice" ? (
              <div className="grid gap-2">
                {item.options.map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`response-${item.id}`}
                      disabled={locked}
                      checked={answer === option.id}
                      onChange={() => set(item.id, option.id)}
                      className="mt-1"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <input
                aria-label={item.question}
                disabled={locked}
                inputMode={item.kind === "number" ? "numeric" : undefined}
                value={typeof answer === "string" ? answer : ""}
                maxLength={200}
                spellCheck={false}
                onChange={(event) => set(item.id, event.target.value)}
                className="block w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
                placeholder={item.kind === "number" ? "秒数" : "例如 /api/…"}
              />
            )}
          </section>
        );
      })}
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交解读"
        last={last}
        onSubmit={() =>
          void submit({ answers: state.answers }, "http_response_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch5 · Method lab
// ---------------------------------------------------------------------------

function BooksTable({ world, highlight }: { world: World; highlight?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold">服务器上的馆藏数据（实时）</p>
      <table className="w-full text-left text-xs">
        <tbody>
          {world.books.map((book) => {
            const data = publicBook(book);
            return (
              <tr key={book.id} className={cn("border-t border-border/60 first:border-t-0", book.id === highlight && "bg-primary/10")}>
                <td className="px-3 py-1.5 font-mono">{book.id}</td>
                <td className="px-3 py-1.5">{data.title ?? <em className="text-destructive">（空）</em>}</td>
                <td className="px-3 py-1.5">{data.author ?? <em className="text-destructive">（空）</em>}</td>
                <td className="px-3 py-1.5 font-mono">{data.year ?? <em className="text-destructive">—</em>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const METHOD_WB_INITIAL: WorkbenchState = {
  draft: { ...getRequest("/api/books/7") },
  history: [],
  selected: null,
  passed: false,
};
const normalizeMethodWb = (value: unknown) => normalizeWorkbench(value, METHOD_WB_INITIAL);

export function MethodLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<WorkbenchState>(METHOD_WB_INITIAL, normalizeMethodWb);
  const { submit, pending, last } = useLabSubmit();
  return (
    <div className="space-y-5" data-testid="http-hands-on-method">
      <Ticket goal="用最合适的方法修正书名；作者、年份、可借状态都必须保持原样。">
        {METHOD_LAB.ticket}你已经以馆员身份登录（Cookie 罐里有会话）。
      </Ticket>
      <Workbench
        id="方法实验"
        state={state}
        setState={setState}
        readOnly={readOnly}
        as={METHOD_LAB.as}
        aside={(world) => <BooksTable world={world} highlight={METHOD_LAB.bookId} />}
      />
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        disabled={state.history.length === 0}
        label="提交全部请求记录"
        last={last}
        onSubmit={() =>
          void submit({ history: state.history }, "http_method_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch6 · JSON lab
// ---------------------------------------------------------------------------

const JSON_WB_INITIAL: WorkbenchState = { draft: { ...JSON_LAB.broken }, history: [], selected: null, passed: false };
const normalizeJsonWb = (value: unknown) => normalizeWorkbench(value, JSON_WB_INITIAL);

export function JsonLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<WorkbenchState>(JSON_WB_INITIAL, normalizeJsonWb);
  const { submit, pending, last } = useLabSubmit();
  const lastSent = state.history.at(-1) ?? null;
  return (
    <div className="space-y-5" data-testid="http-hands-on-json">
      <Ticket goal="让这条留言创建成功（201 Created）。每次只改一处，看服务器的回答怎么变。">{JSON_LAB.ticket}</Ticket>
      <Workbench id="JSON 实验" state={state} setState={setState} readOnly={readOnly} />
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        disabled={!lastSent}
        label="提交最后一次发送的请求"
        last={last}
        onSubmit={() =>
          lastSent &&
          void submit(lastSent, "http_json_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch7 · Cookie lab
// ---------------------------------------------------------------------------

type CookieState = { config: CookieConfig; passed: boolean };
const COOKIE_STATE_INITIAL: CookieState = { config: { ...COOKIE_INITIAL }, passed: false };
function normalizeCookie(value: unknown): CookieState {
  const record = asRecord(value) ?? {};
  const config = asRecord(record.config) ?? {};
  return {
    config: {
      path: COOKIE_PATHS.includes(config.path as CookieConfig["path"]) ? (config.path as CookieConfig["path"]) : COOKIE_INITIAL.path,
      secure: config.secure === true,
      httpOnly: config.httpOnly === true,
      sameSite: ["Strict", "Lax", "None"].includes(config.sameSite as string) ? (config.sameSite as CookieConfig["sameSite"]) : COOKIE_INITIAL.sameSite,
    },
    passed: record.passed === true,
  };
}

export function CookieLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<CookieState>(COOKIE_STATE_INITIAL, normalizeCookie);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const patch = (part: Partial<CookieConfig>) => setState((current) => ({ ...current, config: { ...current.config, ...part } }));
  const result = evaluateCookie(state.config);
  return (
    <div className="space-y-5" data-testid="http-hands-on-cookie">
      <Ticket goal="调整登录响应里的 Set-Cookie，让下面五个场景全部变绿。没有提示哪个属性管哪个场景——自己试出来。">
        library.test 登录成功后会下发会话 Cookie。安全团队列出了五个必须满足的场景。
      </Ticket>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium">
          Path
          <select aria-label="Path" disabled={locked} value={state.config.path} onChange={(event) => patch({ path: event.target.value as CookieConfig["path"] })} className={selectClass}>
            {COOKIE_PATHS.map((path) => (
              <option key={path}>{path}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          SameSite
          <select aria-label="SameSite" disabled={locked} value={state.config.sameSite} onChange={(event) => patch({ sameSite: event.target.value as CookieConfig["sameSite"] })} className={selectClass}>
            <option>Strict</option>
            <option>Lax</option>
            <option>None</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end rounded-md border border-border p-2 text-sm">
          <input type="checkbox" disabled={locked} checked={state.config.secure} onChange={(event) => patch({ secure: event.target.checked })} />
          Secure
        </label>
        <label className="flex items-center gap-2 self-end rounded-md border border-border p-2 text-sm">
          <input type="checkbox" disabled={locked} checked={state.config.httpOnly} onChange={(event) => patch({ httpOnly: event.target.checked })} />
          HttpOnly
        </label>
      </div>
      <MessageText text={`HTTP/1.1 201 Created\n${setCookieLine(state.config)}`} />
      {!result.stored && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">浏览器拒收了这个 Cookie：SameSite=None 必须同时带 Secure。</p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {COOKIE_SCENARIOS.map((scenario) => {
          const outcome = result.outcomes.find((item) => item.id === scenario.id)!;
          return (
            <section
              key={scenario.id}
              className={cn("space-y-1.5 rounded-xl border p-3", outcome.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5")}
              data-cookie-scenario={scenario.id}
              data-ok={outcome.ok}
            >
              <Verdict ok={outcome.ok}>{scenario.title}</Verdict>
              <p className="text-xs text-muted-foreground">{scenario.detail}</p>
              <p className="text-xs">
                <span className="font-medium">期望：</span>
                {scenario.want}
              </p>
              <p className="font-mono text-xs">{scenario.id === "xss" ? `document.cookie → ${outcome.sent ? '"sid=abc123"' : '""'}` : outcome.sent ? "Cookie: sid=abc123" : "（没有 Cookie）"}</p>
              <p className="text-xs leading-relaxed">{outcome.detail}</p>
            </section>
          );
        })}
      </div>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交 Cookie 配置"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "http_cookie_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch10 · Cache lab
// ---------------------------------------------------------------------------

type CacheState = { config: CacheConfig; passed: boolean };
const CACHE_STATE_INITIAL: CacheState = { config: { ...CACHE_INITIAL }, passed: false };
function normalizeCache(value: unknown): CacheState {
  const record = asRecord(value) ?? {};
  const config = asRecord(record.config) ?? {};
  const pick = (id: keyof CacheConfig) =>
    CACHE_POLICIES.includes(config[id] as CachePolicy) ? (config[id] as CachePolicy) : CACHE_INITIAL[id];
  return { config: { html: pick("html"), js: pick("js"), loans: pick("loans") }, passed: record.passed === true };
}

const CELL_STYLE: Record<CacheCell["action"], { label: string; className: string }> = {
  download: { label: "200 下载", className: "bg-muted text-foreground" },
  "revalidate-304": { label: "304 验证", className: "bg-primary/10 text-primary" },
  "revalidate-200": { label: "验证→200 新版", className: "bg-muted text-foreground" },
  cache: { label: "直接用缓存", className: "bg-success/10 text-success" },
  stale: { label: "⚠ 过期内容", className: "bg-destructive/15 text-destructive font-semibold" },
};

function kb(bytes: number) {
  return bytes >= 1000 ? `${(bytes / 1000).toFixed(1)} kB` : `${bytes} B`;
}

export function CacheLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<CacheState>(CACHE_STATE_INITIAL, normalizeCache);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const result = simulateCache(state.config);
  return (
    <div className="space-y-5" data-testid="http-hands-on-cache">
      <Ticket goal="为三类资源选 Cache-Control，让下方四个目标全部达成。">
        网站上线后，读者抱怨「借了书却看不到」「更新后还是旧页面」，同时流量账单也很高。下面会用你的配置回放一位读者两天里的访问。
      </Ticket>
      <div className="grid gap-3 md:grid-cols-3">
        {CACHE_RESOURCES.map((resource) => (
          <label key={resource.id} className="text-xs font-medium">
            <span className="font-mono">{resource.label}</span> 的 Cache-Control
            <span className="block font-normal text-muted-foreground">{resource.description}</span>
            <select
              aria-label={`${resource.label} 缓存策略`}
              disabled={locked}
              value={state.config[resource.id]}
              onChange={(event) =>
                setState((current) => ({ ...current, config: { ...current.config, [resource.id]: event.target.value as CachePolicy } }))
              }
              className={cn(selectClass, "font-mono")}
            >
              {CACHE_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {policy}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <ul className="m-0 list-none p-0 grid gap-2 sm:grid-cols-2">
        {result.goals.map((goal) => (
          <li key={goal.id} className="rounded-md border border-border px-3 py-2">
            <Verdict ok={goal.ok}>{goal.label}</Verdict>
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">时间</th>
              {CACHE_RESOURCES.map((resource) => (
                <th key={resource.id} className="px-3 py-2 font-mono font-medium">
                  {resource.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CACHE_TIMELINE.map((step) => {
              if (step.kind === "event") {
                return (
                  <tr key={step.label} className="border-t border-border/70 bg-warning/10">
                    <td colSpan={CACHE_RESOURCES.length + 1} className="px-3 py-1.5 font-medium">
                      {step.label}
                    </td>
                  </tr>
                );
              }
              const row = result.rows.find((item) => item.label === step.label)!;
              return (
              <tr key={row.label} className="border-t border-border/70">
                <td className="px-3 py-2">{row.label}</td>
                {CACHE_RESOURCES.map((resource) => {
                  const cell = row.cells[resource.id];
                  const style = CELL_STYLE[cell.action];
                  return (
                    <td key={resource.id} className="px-3 py-2">
                      <span className={cn("inline-block rounded px-1.5 py-0.5", style.className)}>{style.label}</span>
                      {cell.bytes > 0 && <span className="ml-1 text-muted-foreground">{kb(cell.bytes)}</span>}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        按你的配置，两天里共发出 {result.requests} 个网络请求，传输 {kb(result.bytes)}。
      </p>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交缓存策略"
        last={last}
        onSubmit={() =>
          void submit({ ...state.config }, "http_cache_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch11 · Diagnosis lab
// ---------------------------------------------------------------------------

type DiagnosisState = { answers: Record<string, string>; root: string; selected: string; passed: boolean };
const DIAGNOSIS_INITIAL: DiagnosisState = { answers: {}, root: "", selected: "doc", passed: false };
function normalizeDiagnosis(value: unknown): DiagnosisState {
  const record = asRecord(value) ?? {};
  const raw = asRecord(record.answers) ?? {};
  const ids = new Set<string>(DIAGNOSIS_REQUESTS.map((item) => item.id));
  const answers = Object.fromEntries(Object.entries(raw).filter(([key, entry]) => ids.has(key) && typeof entry === "string")) as Record<string, string>;
  return {
    answers,
    root: typeof record.root === "string" && ids.has(record.root) ? record.root : "",
    selected: typeof record.selected === "string" && ids.has(record.selected) ? record.selected : DIAGNOSIS_INITIAL.selected,
    passed: record.passed === true,
  };
}

export function DiagnosisLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<DiagnosisState>(DIAGNOSIS_INITIAL, normalizeDiagnosis);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const [tab, setTab] = React.useState<"request" | "response">("request");
  const selected = DIAGNOSIS_REQUESTS.find((item) => item.id === state.selected) ?? DIAGNOSIS_REQUESTS[0];
  return (
    <div className="space-y-5" data-testid="http-hands-on-diagnosis">
      <Ticket goal="逐条判断每个请求是否有问题；最后指出让借阅列表变空的那一条。">
        读者小林说：登录后打开「我的借阅」，页面能显示，但列表是空的，字体也怪怪的。这是他电脑上 DevTools Network 面板录下的记录（{DIAGNOSIS_PAGE}）。
      </Ticket>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <NetworkList
          rows={DIAGNOSIS_REQUESTS.map((item) => ({
            key: item.id,
            method: item.method,
            name: item.url.replace(/^https:\/\/library\.test/, ""),
            status: Number.isNaN(Number(item.status)) ? null : Number(item.status),
            statusLabel: item.status,
            extra: !item.answer ? (
              <span className="text-muted-foreground">不用判断</span>
            ) : (
              <select
                aria-label={`${item.url} 的判断`}
                disabled={locked}
                value={state.answers[item.id] ?? ""}
                onChange={(event) => setState((current) => ({ ...current, answers: { ...current.answers, [item.id]: event.target.value } }))}
                className="w-44 rounded-md border border-border bg-background p-1 text-xs"
              >
                <option value="">请选择</option>
                {DIAGNOSIS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ),
          }))}
          selected={state.selected}
          onSelect={(key) => setState((current) => ({ ...current, selected: String(key) }))}
        />
        <div className="min-w-0 space-y-2 rounded-lg border border-border p-3">
          <p className="break-all font-mono text-xs">{selected.url}</p>
          {selected.note && <p className="text-xs">{selected.note}</p>}
          <p className="text-xs text-muted-foreground">
            类型 {selected.type} · 大小 {selected.size} · 耗时 {selected.time}
          </p>
          <div className="flex gap-2" role="tablist">
            {(["request", "response"] as const).map((key) => (
              <Button key={key} type="button" size="sm" role="tab" aria-selected={tab === key} variant={tab === key ? "secondary" : "ghost"} onClick={() => setTab(key)}>
                {key === "request" ? "请求" : "响应"}
              </Button>
            ))}
          </div>
          <MessageText text={tab === "request" ? selected.request : selected.response} />
        </div>
      </div>
      <label className="block text-sm font-medium">
        让「我的借阅」列表变空的根因是哪一条请求？
        <select
          aria-label="让「我的借阅」列表变空的根因是哪一条请求？"
          disabled={locked}
          value={state.root}
          onChange={(event) => setState((current) => ({ ...current, root: event.target.value }))}
          className={selectClass}
        >
          <option value="">请选择</option>
          {DIAGNOSIS_REQUESTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.method} {item.url}
            </option>
          ))}
        </select>
      </label>
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        label="提交诊断报告"
        last={last}
        onSubmit={() =>
          void submit({ answers: state.answers, root: state.root }, "http_diagnosis_lab_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ch12 · Final mission
// ---------------------------------------------------------------------------

const MISSION_WB_INITIAL: WorkbenchState = { draft: { ...getRequest("/api/books") }, history: [], selected: null, passed: false };
const normalizeMissionWb = (value: unknown) => normalizeWorkbench(value, MISSION_WB_INITIAL);

function LoansView({ world }: { world: World }) {
  const mine = world.loans.filter((loan) => loan.user === "xiaolin");
  return (
    <div className="rounded-lg border border-border p-3 text-xs">
      <p className="font-semibold">服务器上小林的借阅（实时）</p>
      {mine.length === 0 ? (
        <p className="mt-1 text-muted-foreground">（无）</p>
      ) : (
        <ul className="m-0 list-none p-0 mt-1 space-y-1">
          {mine.map((loan) => (
            <li key={loan.id}>
              #{loan.id} · {world.books.find((book) => book.id === loan.bookId)?.title ?? loan.bookId}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinalMission({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<WorkbenchState>(MISSION_WB_INITIAL, normalizeMissionWb);
  const { submit, pending, last } = useLabSubmit();
  return (
    <div className="space-y-5" data-testid="http-hands-on-mission">
      <Ticket goal="小林名下恰好有一本可借的《HTTP 实战手册》。">
        {MISSION.ticket}
      </Ticket>
      <div className="overflow-x-auto rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold">API 文档</p>
        <table className="w-full min-w-[28rem] text-left text-xs">
          <tbody>
            {MISSION.docs.map((doc) => (
              <tr key={`${doc.method} ${doc.path}`} className="border-t border-border/60 first:border-t-0">
                <td className="px-3 py-1.5 font-mono">{doc.method}</td>
                <td className="px-3 py-1.5 font-mono">{doc.path}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{doc.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Workbench id="综合任务" state={state} setState={setState} readOnly={readOnly} aside={(world) => <LoansView world={world} />} />
      <LabFooter
        save={save}
        passed={state.passed}
        pending={pending}
        readOnly={readOnly}
        disabled={state.history.length === 0}
        label="提交全部请求记录"
        last={last}
        onSubmit={() =>
          void submit({ history: state.history }, "http_final_mission_submitted").then((ok) => {
            if (ok) setState((current) => ({ ...current, passed: true }));
          })
        }
      />
    </div>
  );
}
