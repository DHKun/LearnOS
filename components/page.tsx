import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 6.5C4 5.7 4.7 5 5.5 5H11v14H5.5C4.7 19 4 18.3 4 17.5Z" />
          <path d="M20 6.5c0-.8-.7-1.5-1.5-1.5H13v14h5.5c.8 0 1.5-.7 1.5-1.5Z" />
        </svg>
      </div>
      <p className="font-serif text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        accent && "border-primary/30 bg-primary/5",
      )}
    >
      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
