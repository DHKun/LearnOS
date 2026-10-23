"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { LessonHeading } from "@/lib/content/headings";

export function LessonOutline({ headings }: { headings: LessonHeading[] }) {
  const [activeId, setActiveId] = React.useState<string | null>(headings[0]?.id ?? null);

  React.useEffect(() => {
    if (headings.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = 120;
      let current = headings[0].id;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= offset) current = heading.id;
      }
      setActiveId(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="本章小节目录"
      className="hidden overflow-hidden rounded-xl border border-dashed border-border/80 bg-muted/20 lg:block"
    >
      <div className="flex items-center justify-between border-b border-dashed border-border/80 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">当前章节</p>
          <p className="text-[12px] font-medium text-foreground">本章小节目录</p>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{headings.length}</span>
      </div>
      <ol className="max-h-[calc(100vh-12rem)] space-y-0.5 overflow-y-auto p-2">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "location" : undefined}
                onClick={() => setActiveId(heading.id)}
                className={cn(
                  "block rounded-md border-l-2 py-1.5 text-[13px] leading-snug transition-colors",
                  heading.depth === 2 ? "pl-2.5" : "pl-5 text-[12px]",
                  active
                    ? "border-primary bg-primary/8 font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
