"use client";

import * as React from "react";
import { CheckCircle2, FlaskConical, ShieldCheck, XCircle } from "lucide-react";

import { ActivitySaveStatus } from "@/components/activities/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  auditPayloads,
  isSqlDefenceId,
  isSqlPayloadId,
  SQL_DEFENCES,
  SQL_PAYLOADS,
  validateSqlDefences,
  type SqlInjectionFeedback,
} from "@/lib/activities/sql-injection";
import { useLearning } from "@/lib/learning/context";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps, LearningState } from "@/lib/learning/types";

type SqlActivityState = {
  defences: string[];
  payloadId: string;
  audited: boolean;
  passed: boolean;
} & LearningState;

const INITIAL: SqlActivityState = {
  defences: [],
  payloadId: "classic",
  audited: false,
  passed: false,
};

function normalize(value: unknown): SqlActivityState {
  const raw = (value ?? {}) as Record<string, unknown>;
  const defences = Array.isArray(raw.defences)
    ? raw.defences.filter((item): item is string => isSqlDefenceId(item))
    : [];
  return {
    defences,
    payloadId: isSqlPayloadId(raw.payloadId) ? raw.payloadId : "classic",
    audited: raw.audited === true,
    passed: raw.passed === true,
  };
}

export function SqlInjectionActivity({ readOnly }: ActivityComponentProps) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } =
    useActivityState<SqlActivityState>(INITIAL, normalize);
  const [feedback, setFeedback] = React.useState<SqlInjectionFeedback | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const payload = SQL_PAYLOADS.find((item) => item.id === state.payloadId) ?? SQL_PAYLOADS[0];
  const parameterized = state.defences.includes("parameterize");
  const results = auditPayloads(state.defences);

  function toggleDefence(id: string) {
    if (readOnly || state.passed) return;
    const enabled = !state.defences.includes(id);
    setState({
      ...state,
      defences: enabled
        ? [...state.defences, id]
        : state.defences.filter((item) => item !== id),
      audited: false,
    });
    sdk.track("defence_toggled", { defence: id, enabled });
  }

  function selectPayload(id: string) {
    if (readOnly || state.passed) return;
    setState({ ...state, payloadId: id, audited: false });
    sdk.track("payload_selected", { payloadId: id });
  }

  function runAudit() {
    if (readOnly || state.passed) return;
    setState({ ...state, audited: true });
    const blocked = results.filter((result) => result.blocked).length;
    sdk.track("audit_run", { defences: state.defences, blocked });
  }

  async function submitAudit() {
    if (readOnly || state.passed || submitting) return;
    setSubmitting(true);
    try {
      const result = await sdk.submit({ defences: state.defences });
      const next = validateSqlDefences(state.defences);
      setFeedback({ ...next, passed: result.passed });
      if (result.passed) {
        setState({ ...state, passed: true });
        await sdk.complete("audit");
        sdk.track("audit_passed", { defences: state.defences });
      } else {
        sdk.track("audit_failed", { defences: state.defences });
      }
    } catch (caught) {
      setFeedback({
        passed: false,
        message: caught instanceof Error ? caught.message : "提交失败",
        results: [],
      });
    } finally {
      setSubmitting(false);
    }
  }

  const queryPreview = parameterized
    ? `SELECT id, password_hash\n  FROM users\n WHERE email = $1;\n\n-- 参数 1 = ${JSON.stringify(payload.label)}`
    : `SELECT id, password_hash\n  FROM users\n WHERE ${payload.kind === "numeric" ? "id" : "email"} = ${
        payload.kind === "numeric" ? payload.label : `'${payload.label}'`
      };`;

  return (
    <div className="space-y-5" data-testid="sql-activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FlaskConical className="size-3" /> 互动实验
          </Badge>
          <Badge variant="outline">服务端验证</Badge>
          {state.passed && (
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

      <p className="text-sm leading-relaxed text-muted-foreground">
        一条登录 SQL 正在接受审计。选择防御措施并运行注入测试，提交后由服务端验证器重新判定。
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">01 · 防御措施</CardTitle>
            <p className="text-xs text-muted-foreground">可以组合多种措施，部分措施只对特定上下文有效。</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {SQL_DEFENCES.map((defence) => {
              const checked = state.defences.includes(defence.id);
              return (
                <label
                  key={defence.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--primary)]"
                    checked={checked}
                    disabled={readOnly || state.passed}
                    onChange={() => toggleDefence(defence.id)}
                  />
                  <span>
                    <span className="block font-medium">{defence.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {defence.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">02 · 测试载荷</CardTitle>
            <p className="text-xs text-muted-foreground">选择注入载荷，查看查询结构与审计结果。</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {SQL_PAYLOADS.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="sql-payload"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  checked={state.payloadId === item.id}
                  disabled={readOnly || state.passed}
                  onChange={() => selectPayload(item.id)}
                />
                <span>
                  <code className="text-xs">{item.label}</code>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    注入点：{item.context}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">03 · 查询与审计结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-x-auto rounded-lg bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100">
            {queryPreview}
          </pre>
          <p className="text-xs text-muted-foreground">
            {parameterized
              ? "参数化：SQL 结构在绑定参数前固定，载荷不会参与语法解析。"
              : "字符串拼接：用户输入直接进入 SQL 文本，可能改变查询结构。"}
          </p>

          {state.audited && (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <code className="min-w-0 truncate">{result.label}</code>
                  <span
                    className={
                      result.blocked
                        ? "inline-flex items-center gap-1 text-success"
                        : "inline-flex items-center gap-1 text-destructive"
                    }
                  >
                    {result.blocked ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    {result.blocked ? "已阻止" : "可绕过"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={runAudit} disabled={readOnly || state.passed}>
              运行安全审计
            </Button>
            <Button
              type="button"
              onClick={() => void submitAudit()}
              disabled={!state.audited || state.passed || submitting || readOnly}
            >
              {submitting ? "正在提交…" : "提交审计结论"}
            </Button>
            {state.passed && <span className="text-sm text-success">服务端验证通过</span>}
          </div>

          {feedback && (
            <div
              className={
                feedback.passed
                  ? "rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
                  : "rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              }
            >
              {feedback.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
