import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label ?? "课程进度"}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {clamped}%
      </span>
    </div>
  );
}
