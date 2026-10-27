"use client";

/**
 * Visual primitives for concept animation scenes: nodes, a lane with a
 * sliding message chip, raw message lines, chips and segmented controls.
 * Theme tokens only, so light and dark both work; transitions are
 * motion-safe so reduced-motion users get the end state of each step.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function Node({
  title,
  subtitle,
  active = false,
  tone = "default",
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  tone?: "default" | "danger" | "success";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-card p-3 shadow-sm motion-safe:transition-colors motion-safe:duration-300",
        active ? "border-primary ring-2 ring-primary/25" : "border-border",
        tone === "danger" && "border-destructive/60 ring-destructive/20",
        tone === "success" && "border-success/60 ring-success/20",
        className,
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      {subtitle && <p className="font-mono text-[11px] text-muted-foreground">{subtitle}</p>}
      {children && <div className="mt-2 text-xs">{children}</div>}
    </div>
  );
}

/**
 * A horizontal lane with a message chip that slides between two ends.
 * `at` is 0 (left) … 100 (right); the chip animates between renders.
 */
export function Lane({
  at,
  label,
  visible = true,
  tone = "default",
  caption,
}: {
  at: number;
  label: string;
  visible?: boolean;
  tone?: "default" | "danger" | "success" | "muted";
  caption?: string;
}) {
  return (
    <div className="relative h-14 min-w-0">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-border" />
      <div
        className={cn(
          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] shadow-sm motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-in-out",
          visible ? "opacity-100" : "opacity-0",
          tone === "default" && "border-primary/50 bg-primary/10 text-primary",
          tone === "danger" && "border-destructive/50 bg-destructive/10 text-destructive line-through",
          tone === "success" && "border-success/50 bg-success/10 text-success",
          tone === "muted" && "border-border bg-muted text-muted-foreground",
        )}
        style={{ left: `${Math.min(90, Math.max(10, at))}%` }}
      >
        {label}
      </div>
      {caption && <p className="absolute inset-x-0 bottom-0 text-center text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** Raw message lines; lines after `shown` are hidden, `focus` is highlighted. */
export function MessageLines({
  lines,
  shown,
  focus,
  notes = {},
}: {
  lines: string[];
  shown: number;
  focus?: number;
  notes?: Record<number, string>;
}) {
  return (
    <div className="space-y-1 rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-100">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "flex min-h-5 flex-wrap items-baseline gap-x-3 rounded px-1 motion-safe:transition-all motion-safe:duration-500",
            index < shown ? "opacity-100" : "opacity-0",
            index === focus && "bg-sky-500/20 ring-1 ring-sky-400/60",
          )}
        >
          <span className="whitespace-pre-wrap break-all">{line || "（空行）"}</span>
          {notes[index] && index < shown && <span className="font-sans text-[11px] text-sky-300">← {notes[index]}</span>}
        </div>
      ))}
    </div>
  );
}

export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "default" && "border-border bg-muted text-foreground",
        tone === "danger" && "border-destructive/50 bg-destructive/10 text-destructive",
        tone === "success" && "border-success/50 bg-success/10 text-success",
        tone === "warning" && "border-warning/60 bg-warning/15 text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-medium">{label}</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono",
              value === option.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
