"use client";

/** HTTP-specific building blocks for the http-hands-on labs. Not an activity itself. */
import * as React from "react";
import { Plus, RotateCcw, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  type Header,
  LIMITS,
  type LabRequest,
  type LabResponse,
  METHODS,
  type Method,
  asRecord,
  isBrowserManaged,
  parseLabRequest,
  requestText,
  responseText,
  statusFamily,
} from "../simulation/http";
import { type BrowserResult, type World, createWorld, replay } from "../simulation/library";

// ---------------------------------------------------------------------------
// Message display
// ---------------------------------------------------------------------------

const FAMILY_STYLE = {
  info: "border-border bg-muted text-muted-foreground",
  success: "border-success/40 bg-success/10 text-success",
  redirect: "border-primary/40 bg-primary/10 text-primary",
  client: "border-warning/50 bg-warning/15 text-foreground",
  server: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

export function StatusPill({ status, label }: { status: number | null; label?: string }) {
  const style = status === null ? FAMILY_STYLE.server : FAMILY_STYLE[statusFamily(status)];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs font-semibold", style)}>
      {label ?? status ?? "(failed)"}
    </span>
  );
}

/** Raw HTTP/1.1 text with the start line and header names emphasised. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const [head, ...rest] = text.split("\n\n");
  const body = rest.join("\n\n");
  const [startLine, ...headerLines] = head.split("\n");
  return (
    <pre
      className={cn(
        "max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100",
        className,
      )}
    >
      <span className="font-semibold text-sky-300">{startLine}</span>
      {headerLines.map((line, index) => {
        const colon = line.indexOf(":");
        return (
          <React.Fragment key={index}>
            {"\n"}
            {colon > 0 ? (
              <>
                <span className="text-emerald-300">{line.slice(0, colon)}</span>
                {line.slice(colon)}
              </>
            ) : (
              line
            )}
          </React.Fragment>
        );
      })}
      {rest.length > 0 && (
        <>
          {"\n\n"}
          <span className="text-amber-200">{body}</span>
        </>
      )}
    </pre>
  );
}

export function ExchangeView({ result }: { result: BrowserResult }) {
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold">浏览器实际发出的请求</p>
        {result.wire ? <MessageText text={requestText(result.wire)} /> : <MessageText text="（请求没有发出）" />}
      </div>
      <div className="min-w-0">
        <p className="mb-1 flex items-center gap-2 text-xs font-semibold">
          服务器的响应
          {result.response ? <StatusPill status={result.response.status} /> : <StatusPill status={null} />}
        </p>
        {result.response ? (
          <MessageText text={responseText(result.response)} />
        ) : (
          <MessageText text={`net::${result.error?.error}\n（没有 HTTP 响应）`} />
        )}
      </div>
      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground lg:col-span-2">
        {result.log.map((line, index) => (
          <p key={index}>· {line}</p>
        ))}
        <p className="text-sm text-foreground">{result.response?.note ?? result.error?.note}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request editor
// ---------------------------------------------------------------------------

const PRESETS: Header[] = [
  { name: "Accept", value: "application/json" },
  { name: "Content-Type", value: "application/json" },
];

export function RequestEditor({
  id,
  value,
  onChange,
  readOnly,
}: {
  id: string;
  value: LabRequest;
  onChange: (next: LabRequest) => void;
  readOnly: boolean;
}) {
  const patch = (part: Partial<LabRequest>) => {
    if (!readOnly) onChange({ ...value, ...part });
  };
  const setHeader = (index: number, part: Partial<Header>) =>
    patch({ headers: value.headers.map((header, i) => (i === index ? { ...header, ...part } : header)) });
  const bodyAllowed = value.method !== "GET" && value.method !== "HEAD";
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-2 sm:grid-cols-[7.5rem_1fr]">
        <label className="text-xs font-medium">
          方法
          <select
            aria-label={`${id} 方法`}
            disabled={readOnly}
            value={value.method}
            onChange={(event) => patch({ method: event.target.value as Method })}
            className="mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
          >
            {METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-medium">
          URL
          <input
            aria-label={`${id} URL`}
            disabled={readOnly}
            value={value.url}
            maxLength={LIMITS.url}
            spellCheck={false}
            onChange={(event) => patch({ url: event.target.value })}
            className="mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm"
          />
        </label>
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="text-xs font-medium">请求头</legend>
        {value.headers.map((header, index) => (
          <div key={index} className="flex min-w-0 items-center gap-2">
            <input
              aria-label={`${id} 请求头 ${index + 1} 名称`}
              disabled={readOnly}
              value={header.name}
              maxLength={LIMITS.headerName}
              spellCheck={false}
              onChange={(event) => setHeader(index, { name: event.target.value })}
              className={cn(
                "w-32 shrink-0 rounded-md border border-border bg-background p-1.5 font-mono text-xs sm:w-40",
                isBrowserManaged(header.name) && "line-through opacity-60",
              )}
            />
            <input
              aria-label={`${id} 请求头 ${index + 1} 值`}
              disabled={readOnly}
              value={header.value}
              maxLength={LIMITS.headerValue}
              spellCheck={false}
              onChange={(event) => setHeader(index, { value: event.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-background p-1.5 font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={readOnly}
              aria-label={`删除请求头 ${header.name || index + 1}`}
              onClick={() => patch({ headers: value.headers.filter((_, i) => i !== index) })}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly || value.headers.length >= LIMITS.headers}
            onClick={() => patch({ headers: [...value.headers, { name: "", value: "" }] })}
          >
            <Plus className="size-4" /> 添加请求头
          </Button>
          {PRESETS.filter((preset) => !value.headers.some((header) => header.name.toLowerCase() === preset.name.toLowerCase())).map(
            (preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="ghost"
                size="sm"
                disabled={readOnly || value.headers.length >= LIMITS.headers}
                onClick={() => patch({ headers: [...value.headers, { ...preset }] })}
              >
                + {preset.name}: {preset.value}
              </Button>
            ),
          )}
        </div>
        <p className="text-xs text-muted-foreground">Host 和 Cookie 由浏览器自动处理，页面脚本不能自己设置。</p>
      </fieldset>

      <label className="text-xs font-medium">
        请求正文
        <textarea
          aria-label={`${id} 正文`}
          disabled={readOnly || !bodyAllowed}
          value={bodyAllowed ? value.body : ""}
          placeholder={bodyAllowed ? "可选" : `${value.method} 请求不带正文`}
          maxLength={LIMITS.body}
          spellCheck={false}
          rows={3}
          onChange={(event) => patch({ body: event.target.value })}
          className="mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm disabled:opacity-60"
        />
      </label>
    </div>
  );
}

export function normalizeRequest(value: unknown, fallback: LabRequest): LabRequest {
  return parseLabRequest(value) ?? fallback;
}

export function normalizeHistory(value: unknown): LabRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.history)
    .map((item) => parseLabRequest(item))
    .filter((item): item is LabRequest => item !== null);
}

// ---------------------------------------------------------------------------
// Workbench: editor + Network list + selected exchange, replayed from history.
// ---------------------------------------------------------------------------

export type WorkbenchState = { draft: LabRequest; history: LabRequest[]; selected: number | null; passed: boolean };

export function normalizeWorkbench(value: unknown, initial: WorkbenchState): WorkbenchState {
  const record = asRecord(value) ?? {};
  const history = normalizeHistory(record.history);
  const selected =
    typeof record.selected === "number" && record.selected >= 0 && record.selected < history.length ? record.selected : null;
  return {
    draft: normalizeRequest(record.draft, initial.draft),
    history,
    selected,
    passed: record.passed === true,
  };
}

export function NetworkList({
  rows,
  selected,
  onSelect,
}: {
  rows: { key: string | number; method: string; name: string; status: number | null; statusLabel?: string; extra?: React.ReactNode }[];
  selected: string | number | null;
  onSelect: (key: string | number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[28rem] text-left text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">方法</th>
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">状态</th>
            {rows.some((row) => row.extra) && <th className="px-3 py-2 font-medium">你的判断</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                "cursor-pointer border-t border-border/70 hover:bg-muted/40",
                selected === row.key && "bg-primary/10 hover:bg-primary/10",
              )}
              onClick={() => onSelect(row.key)}
            >
              <td className="px-3 py-2 font-mono">{row.method}</td>
              <td className="max-w-[16rem] truncate px-3 py-2 font-mono">
                <button
                  type="button"
                  className="max-w-full truncate text-left underline-offset-2 hover:underline"
                  aria-pressed={selected === row.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(row.key);
                  }}
                >
                  {row.name}
                </button>
              </td>
              <td className="px-3 py-2">
                <StatusPill status={row.status} label={row.statusLabel} />
              </td>
              {row.extra !== undefined && (
                <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                  {row.extra}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortName(url: string): string {
  try {
    const parsed = new URL(url, "https://library.test");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function CookieJar({ world }: { world: World }) {
  return (
    <div className="rounded-lg border border-border p-3 text-xs">
      <p className="font-semibold">浏览器的 Cookie 罐 · library.test</p>
      {world.jar.length === 0 ? (
        <p className="mt-1 text-muted-foreground">（空）</p>
      ) : (
        <ul className="m-0 list-none p-0 mt-1 space-y-1 font-mono">
          {world.jar.map((cookie) => (
            <li key={`${cookie.name}${cookie.path}`}>
              {cookie.name}={cookie.value} <span className="text-muted-foreground">Path={cookie.path}{cookie.httpOnly ? " HttpOnly" : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function useWorkbench(state: WorkbenchState, setState: React.Dispatch<React.SetStateAction<WorkbenchState>>, as?: string) {
  const replayed = React.useMemo(() => replay(state.history, { as }), [state.history, as]);
  const world = replayed.world;
  const full = state.history.length >= LIMITS.history;
  function send() {
    if (full) return;
    setState((current) => ({
      ...current,
      history: [...current.history, current.draft],
      selected: current.history.length,
    }));
  }
  function reset() {
    setState((current) => ({ ...current, history: [], selected: null }));
  }
  return { results: replayed.results, world, full, send, reset, initialWorld: createWorld({ as }) };
}

export function Workbench({
  id,
  state,
  setState,
  readOnly,
  as,
  aside,
  resetLabel = "清空记录并重置模拟数据",
}: {
  id: string;
  state: WorkbenchState;
  setState: React.Dispatch<React.SetStateAction<WorkbenchState>>;
  readOnly: boolean;
  as?: string;
  aside?: (world: World) => React.ReactNode;
  resetLabel?: string;
}) {
  const bench = useWorkbench(state, setState, as);
  const selected = state.selected !== null ? bench.results[state.selected] : null;
  const locked = readOnly || state.passed;
  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-3 rounded-lg border border-border p-3 sm:p-4">
          <RequestEditor id={id} value={state.draft} readOnly={locked} onChange={(draft) => setState((current) => ({ ...current, draft }))} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={locked || bench.full} onClick={bench.send}>
              <Send className="size-4" /> 发送请求
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={locked || state.history.length === 0} onClick={bench.reset}>
              <RotateCcw className="size-4" /> {resetLabel}
            </Button>
            {bench.full && <span className="text-xs text-warning">已达 {LIMITS.history} 条上限，请重置后继续。</span>}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <CookieJar world={bench.world} />
          {aside?.(bench.world)}
        </div>
      </div>

      {state.history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold">Network · 共 {state.history.length} 个请求（点击查看）</p>
          <NetworkList
            rows={bench.results.map((result, index) => ({
              key: index,
              method: state.history[index].method,
              name: shortName(state.history[index].url),
              status: result.response?.status ?? null,
            }))}
            selected={state.selected}
            onSelect={(key) => setState((current) => ({ ...current, selected: Number(key) }))}
          />
          {selected && <ExchangeView result={selected} />}
        </div>
      )}
    </div>
  );
}

export function lastResponse(results: BrowserResult[]): LabResponse | null {
  return results.at(-1)?.response ?? null;
}
