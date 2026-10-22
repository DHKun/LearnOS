"use client";

import * as React from "react";
import { FlaskConical, ShieldCheck } from "lucide-react";

import { ActivitySaveStatus } from "@/components/activities/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  IDEMPOTENCY_KEY_STRATEGIES,
  IDEMPOTENCY_RETRY_POLICIES,
  isKeyStrategy,
  isRetryPolicy,
  simulateIdempotency,
  validateIdempotencyConfig,
  type KeyStrategy,
  type RetryPolicy,
} from "@/lib/activities/idempotency";
import { useLearning } from "@/lib/learning/context";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps, LearningState } from "@/lib/learning/types";

type IdempotencyActivityState = {
  keyStrategy: KeyStrategy;
  retryPolicy: RetryPolicy;
  dedupe: boolean;
  maxRetries: number;
  ran: boolean;
  passed: boolean;
} & LearningState;

const INITIAL: IdempotencyActivityState = {
  keyStrategy: "random",
  retryPolicy: "new-key",
  dedupe: false,
  maxRetries: 2,
  ran: false,
  passed: false,
};

function normalize(value: unknown): IdempotencyActivityState {
  const raw = (value ?? {}) as Record<string, unknown>;
  const maxRetries =
    typeof raw.maxRetries === "number" && Number.isInteger(raw.maxRetries)
      ? Math.max(0, Math.min(5, raw.maxRetries))
      : 2;
  return {
    keyStrategy: isKeyStrategy(raw.keyStrategy) ? raw.keyStrategy : "random",
    retryPolicy: isRetryPolicy(raw.retryPolicy) ? raw.retryPolicy : "new-key",
    dedupe: raw.dedupe === true,
    maxRetries,
    ran: raw.ran === true,
    passed: raw.passed === true,
  };
}

export function IdempotencyActivity({ readOnly }: ActivityComponentProps) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } =
    useActivityState<IdempotencyActivityState>(INITIAL, normalize);
  const [submitting, setSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ passed: boolean; message: string } | null>(null);

  const simulation = simulateIdempotency(state);

  function update(patch: Partial<IdempotencyActivityState>) {
    if (readOnly || state.passed) return;
    setState({ ...state, ...patch, ran: false });
  }

  function runSimulation() {
    if (readOnly || state.passed) return;
    setState({ ...state, ran: true });
    const result = simulateIdempotency(state);
    sdk.track("retry_simulation_run", {
      keyStrategy: state.keyStrategy,
      retryPolicy: state.retryPolicy,
      dedupe: state.dedupe,
      maxRetries: state.maxRetries,
      charges: result.charges,
    });
  }

  async function submitStrategy() {
    if (readOnly || state.passed || submitting) return;
    setSubmitting(true);
    try {
      const result = await sdk.submit({
        keyStrategy: state.keyStrategy,
        retryPolicy: state.retryPolicy,
        dedupe: state.dedupe,
        maxRetries: state.maxRetries,
      });
      const validation = validateIdempotencyConfig(state);
      setFeedback({ passed: result.passed, message: validation.message });
      if (result.passed) {
        setState({ ...state, passed: true });
        await sdk.complete("audit");
        sdk.track("retry_strategy_passed", {});
      } else {
        sdk.track("retry_strategy_failed", {});
      }
    } catch (caught) {
      setFeedback({
        passed: false,
        message: caught instanceof Error ? caught.message : "提交失败",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="idempotency-activity">
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
        订单 #42 需要支付 ¥99。模拟网络在响应回程中连续丢失，客户端会自动重试。配置幂等键与去重策略，使服务端最终只扣款一次。
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">01 · 幂等键生成策略</CardTitle>
            <p className="text-xs text-muted-foreground">键应标识一次业务操作，而不是一次 HTTP 请求。</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {IDEMPOTENCY_KEY_STRATEGIES.map((strategy) => (
              <label
                key={strategy.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="key-strategy"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  checked={state.keyStrategy === strategy.id}
                  disabled={readOnly || state.passed}
                  onChange={() => update({ keyStrategy: strategy.id })}
                />
                <span>
                  <span className="block font-medium">{strategy.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {strategy.description}
                  </span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">02 · 重试与去重</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {IDEMPOTENCY_RETRY_POLICIES.map((policy) => (
              <label
                key={policy.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <input
                  type="radio"
                  name="retry-policy"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  checked={state.retryPolicy === policy.id}
                  disabled={readOnly || state.passed}
                  onChange={() => update({ retryPolicy: policy.id })}
                />
                <span>
                  <span className="block font-medium">{policy.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {policy.description}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--primary)]"
                checked={state.dedupe}
                disabled={readOnly || state.passed}
                onChange={(event) => update({ dedupe: event.target.checked })}
              />
              <span>
                <span className="block font-medium">启用服务端键去重表</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  唯一约束占位，重复请求返回首次结果。
                </span>
              </span>
            </label>

            <div>
              <label htmlFor="max-retries" className="flex items-center justify-between text-sm">
                <span>重试预算</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {state.maxRetries} 次
                </span>
              </label>
              <input
                id="max-retries"
                type="range"
                min={0}
                max={5}
                step={1}
                value={state.maxRetries}
                disabled={readOnly || state.passed}
                onChange={(event) => update({ maxRetries: Number(event.target.value) })}
                className="mt-2 w-full accent-[var(--primary)]"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">03 · 重试时间线与扣款结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <span className="text-sm">最终扣款次数</span>
            <span
              className={
                state.ran
                  ? simulation.charges === 1
                    ? "font-serif text-3xl font-semibold text-success"
                    : "font-serif text-3xl font-semibold text-destructive"
                  : "font-serif text-3xl font-semibold text-muted-foreground"
              }
            >
              {state.ran ? simulation.charges : "—"}
            </span>
          </div>

          {state.ran ? (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {simulation.timeline.map((item) => (
                <li key={item.attempt} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span>
                    #{item.attempt} {item.outcome}
                  </span>
                  <span className={item.charged ? "text-success" : "text-muted-foreground"}>
                    {item.charged ? "扣款 +1" : "重复，已抑制"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">运行模拟后显示每次请求的结果。</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={runSimulation} disabled={readOnly || state.passed}>
              运行支付重试模拟
            </Button>
            <Button
              type="button"
              onClick={() => void submitStrategy()}
              disabled={!state.ran || state.passed || submitting || readOnly}
            >
              {submitting ? "正在提交…" : "提交策略"}
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
