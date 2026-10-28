import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CirclePause, CirclePlay, Clock3, Flag, Map as MapIcon, Route } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PathStep, PathStepState, PathView } from "@/lib/services/paths";
import { cn } from "@/lib/utils";

const STATE_META: Record<PathStepState, { label: string; icon: typeof Circle; text: string; dot: string }> = {
  completed: { label: "已完成", icon: CheckCircle2, text: "text-success", dot: "border-success bg-success text-background" },
  active: { label: "进行中", icon: CirclePlay, text: "text-primary", dot: "border-primary bg-primary text-primary-foreground" },
  abandoned: { label: "已暂停，可恢复", icon: CirclePause, text: "text-warning", dot: "border-warning bg-background text-warning" },
  available: { label: "可参加", icon: Circle, text: "text-muted-foreground", dot: "border-border bg-background text-foreground" },
  upcoming: { label: "即将上线", icon: Clock3, text: "text-muted-foreground/70", dot: "border-dashed border-border bg-muted text-muted-foreground" },
};

export function pathPercent(path: PathView): number {
  return path.steps.length ? Math.round((path.completed / path.steps.length) * 100) : 0;
}

function nextLabel(step: PathStep): string {
  if (step.state === "active") return `继续：${step.title}`;
  if (step.state === "abandoned") return `恢复：${step.title}`;
  return `开始：${step.title}`;
}

function progressText(path: PathView): string {
  const upcoming = path.steps.length - path.available;
  return `已完成 ${path.completed} / ${path.steps.length} 门${upcoming ? `（其中 ${upcoming} 门即将上线）` : ""}`;
}

/** A path as a card: title, progress, a row of step dots and the way in. */
export function PathSummaryCard({ path, compact = false }: { path: PathView; compact?: boolean }) {
  return (
    <section data-path={path.slug} aria-labelledby={`path-${path.slug}-title`} className="rounded-xl border border-border bg-card p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem] lg:items-end">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
            <Route className="size-3.5" aria-hidden /> 学习路线 · {path.level} · {path.steps.length} 门课
          </p>
          <h3 id={`path-${path.slug}-title`} className="mt-2 font-serif text-2xl font-semibold">
            <Link href={`/paths/${path.slug}`} className="hover:underline">
              {path.title}
            </Link>
          </h3>
          {!compact && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{path.description}</p>}
          <ol className="m-0 mt-4 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="路线上的课程">
            {path.steps.map((step, index) => (
              <li key={step.slug} className="flex items-center gap-1.5" data-step={step.slug} data-state={step.state}>
                {index > 0 && <span className={cn("h-px w-4 sm:w-6", path.steps[index - 1]!.state === "completed" ? "bg-success" : "bg-border")} aria-hidden />}
                <span
                  title={`${index + 1}. ${step.title}（${STATE_META[step.state].label}）`}
                  className={cn("flex size-7 items-center justify-center rounded-full border-2 font-mono text-xs", STATE_META[step.state].dot)}
                >
                  {step.state === "completed" ? <CheckCircle2 className="size-4" aria-hidden /> : index + 1}
                </span>
                <span className="sr-only">
                  {step.title}：{STATE_META[step.state].label}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          <Progress value={pathPercent(path)} label={`${path.title}进度`} showValue={false} />
          <p data-testid="path-progress" className="text-xs text-muted-foreground">
            {progressText(path)}
          </p>
          <div className="flex flex-col gap-2">
            {path.next?.courseId && (
              <Button asChild size="sm">
                <Link href={`/courses/${path.next.slug}`}>
                  {nextLabel(path.next)}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/paths/${path.slug}`}>
                <MapIcon className="size-3.5" />
                查看路线图
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, index, isNext }: { step: PathStep; index: number; isNext: boolean }) {
  const meta = STATE_META[step.state];
  const Icon = meta.icon;
  const action =
    step.state === "completed" ? "复习课程" : step.state === "active" ? "继续学习" : step.state === "abandoned" ? "恢复学习" : step.state === "available" ? "查看课程" : null;
  return (
    <article
      data-step={step.slug}
      data-state={step.state}
      className={cn(
        "rounded-xl border bg-card p-5 shadow-sm motion-safe:transition-shadow",
        isNext ? "border-primary ring-2 ring-primary/25" : step.state === "completed" ? "border-success/50" : "border-border",
        step.state === "upcoming" && "border-dashed bg-muted/30 shadow-none",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">第 {index + 1} 站</span>
        <span className={cn("inline-flex items-center gap-1 font-medium", meta.text)}>
          <Icon className="size-3.5" aria-hidden /> {meta.label}
        </span>
        {isNext && <Badge>推荐下一门</Badge>}
      </div>
      <h3 className={cn("mt-2 font-serif text-lg font-semibold leading-snug", step.state === "upcoming" && "text-muted-foreground")}>{step.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.summary}</p>
      {step.progress && (step.state === "active" || step.state === "abandoned") && (
        <div className="mt-3 flex items-center gap-3">
          <Progress className="flex-1" value={step.progress.percent} label={`${step.title}进度`} showValue={false} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {step.progress.completed} / {step.progress.total} 章
          </span>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{step.lessonCount !== null ? `${step.lessonCount} 章` : "正在制作"}</span>
        {action && step.courseId ? (
          <Button asChild size="sm" variant={isNext || step.state === "active" ? "default" : "outline"}>
            <Link href={step.state === "active" ? `/learn/${step.courseId}` : `/courses/${step.slug}`}>
              {action}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <Badge variant="outline">即将上线</Badge>
        )}
      </div>
    </article>
  );
}

/**
 * The path as a flow chart: a spine down the middle with the courses
 * alternating left and right (spine on the left on narrow screens). The
 * spine turns green up to the last completed course.
 */
export function PathMap({ path }: { path: PathView }) {
  const done = path.completed === path.steps.length && path.steps.length > 0;
  const row = "grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 md:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)]";
  const spine = "relative col-start-1 row-start-1 flex justify-center md:col-start-2";
  return (
    <ol className="m-0 list-none p-0" aria-label={`${path.title}路线图`} data-testid="path-map">
      {path.steps.map((step, index) => {
        const meta = STATE_META[step.state];
        const lineAbove = index > 0 && path.steps[index - 1]!.state === "completed";
        return (
          <li key={step.slug} className={row}>
            <div className={spine}>
              <span className={cn("absolute left-1/2 top-0 h-3 w-1 -translate-x-1/2", index === 0 ? "bg-transparent" : lineAbove ? "bg-success" : "bg-border")} aria-hidden />
              <span className={cn("absolute bottom-0 left-1/2 top-3 w-1 -translate-x-1/2", step.state === "completed" ? "bg-success" : "bg-border")} aria-hidden />
              <span
                className={cn("absolute left-1/2 top-[1.9rem] h-1 w-[calc(50%+1rem)]", index % 2 === 0 && "md:left-auto md:right-1/2", step.state === "completed" ? "bg-success/60" : "bg-border")}
                aria-hidden
              />
              <span className={cn("relative z-10 mt-3 flex size-9 items-center justify-center rounded-full border-2 font-mono text-sm font-semibold shadow-sm", meta.dot)} aria-hidden>
                {step.state === "completed" ? <CheckCircle2 className="size-5" /> : index + 1}
              </span>
            </div>
            <div className={cn("col-start-2 row-start-1 pb-8", index % 2 === 0 ? "md:col-start-1" : "md:col-start-3")}>
              <StepCard step={step} index={index} isNext={path.next?.slug === step.slug} />
            </div>
          </li>
        );
      })}
      <li className={row} data-testid="path-finish" data-done={done}>
        <div className={spine}>
          <span className={cn("absolute left-1/2 top-0 h-3 w-1 -translate-x-1/2", done ? "bg-success" : "bg-border")} aria-hidden />
          <span className={cn("relative z-10 mt-3 flex size-9 items-center justify-center rounded-full border-2", done ? "border-success bg-success text-background" : "border-border bg-background text-muted-foreground")} aria-hidden>
            <Flag className="size-4" />
          </span>
        </div>
        <div className="col-start-2 row-start-1 pt-5 md:col-start-3">
          <p className={cn("font-medium", done ? "text-success" : "text-muted-foreground")}>{done ? "路线已完成" : "终点：学完全部课程"}</p>
        </div>
      </li>
    </ol>
  );
}
