import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CirclePause, CirclePlay, Clock3, Route } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PathStep, PathStepState, PathView } from "@/lib/services/paths";
import { cn } from "@/lib/utils";

const STATE_META: Record<PathStepState, { label: string; icon: typeof Circle; className: string }> = {
  completed: { label: "已完成", icon: CheckCircle2, className: "text-success" },
  active: { label: "进行中", icon: CirclePlay, className: "text-primary" },
  abandoned: { label: "已暂停，可恢复", icon: CirclePause, className: "text-warning" },
  available: { label: "可参加", icon: Circle, className: "text-muted-foreground" },
  upcoming: { label: "即将上线", icon: Clock3, className: "text-muted-foreground/70" },
};

function nextLabel(step: PathStep): string {
  if (step.state === "active") return `继续：${step.title}`;
  if (step.state === "abandoned") return `恢复：${step.title}`;
  return `开始：${step.title}`;
}

export function PathCard({ path }: { path: PathView }) {
  const percent = path.available ? Math.round((path.completed / path.available) * 100) : 0;
  return (
    <section
      id={`path-${path.slug}`}
      data-path={path.slug}
      aria-labelledby={`path-${path.slug}-title`}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid gap-6 border-b border-border p-6 lg:grid-cols-[1fr_16rem] lg:items-end">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            <Route className="size-3.5" aria-hidden /> 学习路线 · {path.level}
          </p>
          <h3 id={`path-${path.slug}-title`} className="mt-2 font-serif text-2xl font-semibold">
            {path.title}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{path.description}</p>
        </div>
        <div className="space-y-2">
          <Progress value={percent} label={`${path.title}进度`} showValue={false} />
          <p data-testid="path-progress" className="text-xs text-muted-foreground">
            已完成 {path.completed} / {path.steps.length} 门
            {path.available < path.steps.length && `（其中 ${path.steps.length - path.available} 门即将上线）`}
          </p>
          {path.next && path.next.courseId && (
            <Button asChild size="sm" className="w-full">
              <Link href={`/courses/${path.next.slug}`}>
                {nextLabel(path.next)}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ol className="divide-y divide-border/70">
        {path.steps.map((step, index) => {
          const meta = STATE_META[step.state];
          const Icon = meta.icon;
          const isNext = path.next?.slug === step.slug;
          const body = (
            <>
              <span className="flex w-8 shrink-0 flex-col items-center gap-1 pt-0.5">
                <Icon className={cn("size-5", meta.className)} aria-hidden />
                <span className="font-mono text-[11px] text-muted-foreground">{index + 1}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", step.state === "upcoming" && "text-muted-foreground")}>{step.title}</span>
                  {step.state === "upcoming" ? (
                    <Badge variant="outline">即将上线</Badge>
                  ) : (
                    <span className={cn("text-xs", meta.className)}>{meta.label}</span>
                  )}
                  {isNext && step.state !== "active" && <Badge variant="secondary">推荐下一门</Badge>}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{step.summary}</span>
                {step.progress && step.state !== "completed" && (
                  <span className="mt-2 flex max-w-sm items-center gap-3">
                    <Progress className="flex-1" value={step.progress.percent} label={`${step.title}进度`} showValue={false} />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {step.progress.completed} / {step.progress.total} 章
                    </span>
                  </span>
                )}
              </span>
              {step.lessonCount !== null && (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{step.lessonCount} 章</span>
              )}
            </>
          );
          return (
            <li key={step.slug} data-step={step.slug} data-state={step.state}>
              {step.courseId ? (
                <Link
                  href={`/courses/${step.slug}`}
                  className={cn("flex gap-3 px-6 py-4 transition-colors hover:bg-muted/50", isNext && "bg-primary/5")}
                >
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 px-6 py-4" aria-disabled="true">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
