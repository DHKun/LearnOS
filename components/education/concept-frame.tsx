"use client";

import * as React from "react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";
import type { ConceptId } from "@/lib/education/concepts";
import { cn } from "@/lib/utils";
import { useConceptPlayback } from "@/components/education/use-concept-playback";

export type ConceptStep = {
  title: string;
  description: string;
};

export type ConceptMapping = {
  analogy: string;
  real: string;
  covers: string;
};

export function ConceptFrame({
  conceptId,
  blockId,
  title,
  analogy,
  steps,
  scenes,
  mapping,
  controls,
  insight,
  className,
}: {
  conceptId: ConceptId;
  blockId: string;
  title: string;
  analogy: React.ReactNode;
  steps: ConceptStep[];
  scenes: React.ReactNode[];
  mapping: ConceptMapping[];
  controls?: React.ReactNode;
  insight: string;
  className?: string;
}) {
  const { initialState, sdk, readOnly } = useLearning();
  const initialStep =
    typeof initialState?.conceptStep === "number"
      ? Math.max(0, Math.min(steps.length - 1, initialState.conceptStep))
      : 0;
  const player = useConceptPlayback(steps.length, initialStep);
  const current = steps[player.step];
  const completed = player.step === steps.length - 1;
  const completedRef = React.useRef(false);

  React.useEffect(() => {
    if (readOnly) return;
    sdk.track(
      "concept_viewed",
      { conceptId, blockId, step: player.step + 1, stepTitle: current.title },
      `${blockId}:view`,
    );
    void sdk.saveState({
      conceptId,
      blockId,
      conceptStep: player.step,
      conceptCompleted: completed,
    });
    if (completed && !completedRef.current) {
      completedRef.current = true;
      sdk.track(
        "concept_completed",
        { conceptId, blockId, steps: steps.length },
        `${blockId}:complete`,
      );
    }
  }, [blockId, completed, conceptId, current.title, player.step, readOnly, sdk, steps.length]);

  function trackPlayback(action: "play" | "pause" | "restart" | "step") {
    if (readOnly) return;
    sdk.track(
      `concept_${action}`,
      { conceptId, blockId, step: player.step + 1 },
      `${blockId}:${action}`,
    );
  }

  return (
    <section
      className={cn(
        "my-8 min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
      aria-label={`概念动画：${title}`}
      data-concept-id={conceptId}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("button, a, input, select, textarea, summary")
        ) {
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          player.go(1);
          trackPlayback("step");
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          player.go(-1);
          trackPlayback("step");
        }
        if (event.key === " ") {
          event.preventDefault();
          player.toggle();
          trackPlayback(player.playing ? "pause" : "play");
        }
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">概念动画</Badge>
            <Badge variant="outline">可单步</Badge>
            {completed && <Badge variant="success">已完成</Badge>}
          </div>
          <h3 className="font-serif text-xl font-semibold tracking-tight sm:text-2xl">{title}</h3>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {player.step + 1} / {steps.length}
        </span>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            生活类比
          </p>
          <div className="mt-1.5 text-sm leading-relaxed text-foreground/90">{analogy}</div>
        </div>

        {controls && <div className="rounded-lg border border-border bg-muted/25 p-3">{controls}</div>}

        <div className="relative min-h-56 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:min-h-64 sm:p-6 dark:from-slate-950 dark:to-slate-900">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(15,107,92,0.10),transparent_45%)]" />
          <div className="relative">{scenes[player.step]}</div>
        </div>

        <div className="space-y-1.5" aria-live="polite">
          <p className="text-sm font-medium">{current.title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{current.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              player.toggle();
              trackPlayback(player.playing ? "pause" : "play");
            }}
            disabled={player.reduced}
            aria-label={player.playing ? "暂停动画" : "播放动画"}
          >
            {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {player.playing ? "暂停" : "播放"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              player.go(-1);
              trackPlayback("step");
            }}
            disabled={player.step === 0}
            aria-label="上一步"
          >
            <SkipBack className="size-4" /> 上一步
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              player.go(1);
              trackPlayback("step");
            }}
            disabled={player.step === steps.length - 1}
            aria-label="下一步"
          >
            下一步 <SkipForward className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              player.restart();
              trackPlayback("restart");
            }}
            aria-label="重新播放"
          >
            <RotateCcw className="size-4" /> 重播
          </Button>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            速度
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={player.speed}
              onChange={(event) => player.setSpeed(Number(event.target.value))}
              aria-label="动画速度"
            >
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
            </select>
          </label>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((player.step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {player.reduced && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            已根据系统「减少动态效果」设置关闭自动播放；仍可使用上一步/下一步查看完整过程。
          </p>
        )}

        <p className="rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed">
          {insight}
        </p>

        <details className="group rounded-lg border border-border bg-muted/20 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            类比边界与真实系统映射
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">类比中的事物</th>
                  <th className="px-2 py-1.5">真实对象</th>
                  <th className="px-2 py-1.5">能解释的部分</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row) => (
                  <tr key={row.analogy} className="border-t border-border/70">
                    <td className="px-2 py-1.5">{row.analogy}</td>
                    <td className="px-2 py-1.5">{row.real}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.covers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            类比只帮助建立直觉，不替代真实实现。动画是经过审核的教学模型，不会执行真实 SQL、网络支付或用户脚本。
          </p>
        </details>
      </div>
    </section>
  );
}
