"use client";

/** The byte machine's memory panel. Course-specific; not an activity itself. */
import * as React from "react";

import { cn } from "@/lib/utils";

import { type Bytes, toHex } from "../simulation/bytes";

export function HexDump({
  bytes,
  columns = 8,
  highlight,
  label,
  offset = 0,
}: {
  bytes: Bytes;
  columns?: number;
  /** Indexes into `bytes` to emphasise. */
  highlight?: (index: number) => "on" | "warn" | undefined;
  label?: string;
  offset?: number;
}) {
  const rows: Bytes[] = [];
  for (let i = 0; i < bytes.length; i += columns) rows.push(bytes.slice(i, i + columns));
  const width = Math.min(columns, bytes.length || columns);
  // A CSS grid rather than <table>: the lesson's prose styles would otherwise
  // add borders and header backgrounds inside the dark panel.
  return (
    <figure className="m-0 min-w-0">
      {label && <figcaption className="mb-1 text-xs font-semibold">{label}</figcaption>}
      <div className="overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
        <div className="grid w-max gap-x-1.5 gap-y-0.5" style={{ gridTemplateColumns: `3rem repeat(${width}, 1.75rem)` }}>
          <span className="text-slate-500">偏移</span>
          {Array.from({ length: width }, (_, i) => (
            <span key={i} className="text-center text-slate-500">
              +{i}
            </span>
          ))}
          {rows.map((row, r) => (
            <React.Fragment key={r}>
              <span className="text-slate-500">{offset + r * columns}</span>
              {row.map((byte, c) => {
                const index = r * columns + c;
                const mark = highlight?.(index);
                return (
                  <span
                    key={c}
                    className={cn(
                      "rounded px-0.5 text-center",
                      mark === "on" && "bg-sky-500/30 text-sky-100",
                      mark === "warn" && "bg-amber-500/30 text-amber-100",
                    )}
                  >
                    {toHex([byte])}
                  </span>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </figure>
  );
}

export function Readout({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "bad" }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 break-all font-mono text-sm",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export const selectClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm";
export const inputClass = "mt-1 block w-full rounded-md border border-border bg-background p-2 font-mono text-sm";
