import * as React from "react";

import { cn } from "@/lib/utils";

type CalloutType = "note" | "tip" | "warning";

const STYLES: Record<CalloutType, string> = {
  note: "border-primary/40 bg-primary/5",
  tip: "border-success/40 bg-success/5",
  warning: "border-warning/60 bg-warning/10",
};

const LABELS: Record<CalloutType, string> = {
  note: "说明",
  tip: "要点",
  warning: "注意",
};

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}) {
  const variant = STYLES[type] ?? STYLES.note;
  return (
    <aside className={cn("my-6 rounded-r-md border-l-4 px-4 py-3 text-[0.95rem]", variant)}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title ?? LABELS[type] ?? LABELS.note}
      </p>
      <div className="[&>p]:my-1 [&>p]:text-foreground/90">{children}</div>
    </aside>
  );
}

export const mdxComponents = {
  Callout,
};
