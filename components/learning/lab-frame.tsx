"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { ApiClientError, apiFetch } from "@/lib/client/api";
import { createUuid } from "@/lib/uuid";
import { LEARNING_PROTOCOL, buildLabUrl, validateIframeMessage } from "@/lib/learning/bridge";
import { Button } from "@/components/ui/button";

type InitState = {
  state: Record<string, unknown> | null;
  version: number;
  updatedAt: string | null;
};

export type LabFrameProps = {
  entryUrl: string;
  lessonId: string;
  enrollmentId: string;
  title: string;
  readOnly: boolean;
  initialState: {
    state: Record<string, unknown> | null;
    version: number;
    updatedAt: string | null;
  } | null;
};

export function LabFrame({
  entryUrl,
  lessonId,
  enrollmentId,
  title,
  readOnly,
  initialState,
}: LabFrameProps) {
  const router = useRouter();
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const nonceRef = React.useRef<string>(createUuid());
  const versionRef = React.useRef(0);
  const initSentRef = React.useRef(false);
  const processedRef = React.useRef(new Set<string>());
  const initialRef = React.useRef<InitState | null>(null);

  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [labUrl, setLabUrl] = React.useState<string | null>(null);

  const labOrigin = React.useMemo(() => {
    try {
      return new URL(entryUrl).origin;
    } catch {
      return null;
    }
  }, [entryUrl]);

  const originAllowed = React.useMemo(() => {
    if (!labOrigin) return false;
    const allowed = (process.env.NEXT_PUBLIC_LABS_ORIGIN ?? "")
      .split(",")
      .map((item) => item.trim().replace(/\/$/, ""))
      .filter(Boolean);
    return allowed.includes(labOrigin);
  }, [labOrigin]);

  React.useEffect(() => {
    if (!originAllowed) return;
    versionRef.current = initialState?.version ?? 0;
    initialRef.current = initialState;
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setLabUrl(buildLabUrl(entryUrl, window.location.origin, theme));
  }, [entryUrl, initialState, originAllowed]);

  const postToLab = React.useCallback(
    (type: "INIT" | "RESULT", requestId: string, payload: Record<string, unknown>) => {
      if (!labOrigin || !iframeRef.current?.contentWindow) return;
      iframeRef.current.contentWindow.postMessage(
        { protocol: LEARNING_PROTOCOL, nonce: nonceRef.current, requestId, type, payload },
        labOrigin,
      );
    },
    [labOrigin],
  );

  const ensureFreshState = React.useCallback(async () => {
    const latest = await apiFetch<InitState>(`/api/learning/states/${lessonId}`);
    versionRef.current = latest.version;
    return latest;
  }, [lessonId]);

  const handleRequest = React.useCallback(
    async (requestId: string, type: string, payload: Record<string, unknown>) => {
      try {
        if (type === "TRACK") {
          const eventType = typeof payload.type === "string" ? payload.type : "";
          const nestedPayload =
            typeof payload.payload === "object" &&
            payload.payload !== null &&
            !Array.isArray(payload.payload)
              ? (payload.payload as Record<string, unknown>)
              : null;
          // Accept the legacy flattened shape from an older cached SDK while
          // preferring the explicit `payload` field used by current SDK builds.
          const eventPayload =
            nestedPayload ??
            Object.fromEntries(
              Object.entries(payload).filter(
                ([key]) => !["type", "stepId", "id", "payload"].includes(key),
              ),
            );
          const stepId = typeof payload.stepId === "string" ? payload.stepId : null;
          const result = await apiFetch<{ accepted: boolean }>("/api/learning/events", {
            method: "POST",
            body: JSON.stringify({
              id: requestId,
              enrollmentId,
              lessonId,
              type: eventType,
              stepId,
              payload: eventPayload,
            }),
          });
          postToLab("RESULT", requestId, { ok: true, data: result });
          return;
        }

        if (type === "SAVE_STATE") {
          const state =
            typeof payload.state === "object" && payload.state !== null
              ? (payload.state as Record<string, unknown>)
              : {};
          try {
            const result = await apiFetch<{ version: number; updatedAt: string }>(
              `/api/learning/states/${lessonId}`,
              {
                method: "PUT",
                keepalive: payload.unload === true,
                body: JSON.stringify({
                  enrollmentId,
                  state,
                  expectedVersion: versionRef.current,
                }),
              },
            );
            versionRef.current = result.version;
            setConflict(false);
            postToLab("RESULT", requestId, { ok: true, data: result });
          } catch (caught) {
            if (caught instanceof ApiClientError && caught.code === "STATE_VERSION_CONFLICT") {
              setConflict(true);
              await ensureFreshState().catch(() => undefined);
            }
            throw caught;
          }
          return;
        }

        if (type === "COMPLETE") {
          try {
            const result = await apiFetch<{ alreadyCompleted: boolean }>(
              `/api/lessons/${lessonId}/complete`,
              {
                method: "POST",
                body: JSON.stringify({ enrollmentId }),
              },
            );
            postToLab("RESULT", requestId, { ok: true, data: { recorded: true, ...result } });
            router.refresh();
          } catch (caught) {
            if (
              caught instanceof ApiClientError &&
              (caught.code === "SERVER_VALIDATION_REQUIRED" ||
                caught.code === "QUIZ_REQUIRES_SUBMISSION" ||
                caught.code === "ENROLLMENT_NOT_ACTIVE")
            ) {
              postToLab("RESULT", requestId, { ok: true, data: { recorded: false } });
              return;
            }
            throw caught;
          }
          return;
        }

        if (type === "SUBMIT") {
          const submission =
            typeof payload.submission === "object" && payload.submission !== null
              ? (payload.submission as Record<string, unknown>)
              : {};
          const result = await apiFetch<{ passed: boolean; feedback: Record<string, unknown> }>(
            "/api/learning/submissions",
            {
              method: "POST",
              body: JSON.stringify({ id: requestId, enrollmentId, lessonId, submission }),
            },
          );
          postToLab("RESULT", requestId, {
            ok: true,
            data: { passed: result.passed, feedback: result.feedback },
          });
          if (result.passed) router.refresh();
          return;
        }

        postToLab("RESULT", requestId, {
          ok: false,
          error: { code: "UNKNOWN_REQUEST", message: "未知的实验请求" },
        });
      } catch (caught) {
        const code = caught instanceof ApiClientError ? caught.code : "INTERNAL_ERROR";
        const message = caught instanceof Error ? caught.message : "请求失败";
        setError(message);
        postToLab("RESULT", requestId, { ok: false, error: { code, message } });
      }
    },
    [enrollmentId, ensureFreshState, lessonId, postToLab, router],
  );

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      const iframe = iframeRef.current;
      if (!labOrigin || !iframe) return;

      const validation = validateIframeMessage({
        data: event.data,
        origin: event.origin,
        expectedOrigin: labOrigin,
        sourceMatches: event.source === iframe.contentWindow,
        expectedNonce: nonceRef.current,
      });
      if (!validation.ok || !validation.message) return;

      const message = validation.message;

      if (message.type === "READY") {
        if (initSentRef.current) return;
        initSentRef.current = true;
        postToLab("INIT", createUuid(), {
          protocolVersion: "1.0.0",
          lessonId,
          title,
          readOnly,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          state:
            initialRef.current && initialRef.current.version > 0
              ? { state: initialRef.current.state, version: initialRef.current.version }
              : null,
        });
        setReady(true);
        return;
      }

      if (processedRef.current.has(message.requestId)) return;
      processedRef.current.add(message.requestId);
      if (processedRef.current.size > 500) {
        processedRef.current = new Set([...processedRef.current].slice(-250));
      }

      const payload = (message.payload ?? {}) as Record<string, unknown>;
      void handleRequest(message.requestId, message.type, payload);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleRequest, labOrigin, lessonId, postToLab, readOnly, title]);

  if (!originAllowed) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        实验地址不在允许的独立域名列表中，已阻止加载。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {labUrl && !ready && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5 animate-spin" />
          正在加载交互实验并恢复上次状态…
        </div>
      )}
      {conflict && (
        <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-warning" />
          <div>
            <p className="font-medium">检测到另一个标签页更新了实验状态</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              已获取最新版本号。本次保存被拒绝以避免静默覆盖，请刷新页面或继续操作后重试。
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              重新加载
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {labUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">隔离实验环境</span>
            <span className="font-mono text-[10px] text-muted-foreground">{labOrigin}</span>
          </div>
          <iframe
            ref={iframeRef}
            src={labUrl}
            title={`交互实验：${title}`}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="origin"
            className="h-[min(72vh,680px)] min-h-[520px] w-full border-0 bg-white"
          />
        </div>
      ) : (
        <div className="grid h-72 place-items-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          正在准备实验…
        </div>
      )}
    </div>
  );
}
