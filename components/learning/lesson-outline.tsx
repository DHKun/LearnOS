"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { LessonHeading } from "@/lib/content/headings";

/** Tracks which h2/h3 of the current chapter the reader has scrolled to. */
export function useActiveHeading(headings: LessonHeading[]) {
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

  return [activeId, setActiveId] as const;
}

/**
 * The current chapter's sections, nested under its entry in the course
 * directory so "where am I in the course" and "where am I in this chapter"
 * are read in one place.
 */
export function LessonOutline({ headings }: { headings: LessonHeading[] }) {
  const [activeId, setActiveId] = useActiveHeading(headings);
  if (headings.length === 0) return null;

  return (
    <ol data-testid="lesson-outline" aria-label="本章小节目录" className="mb-1.5 ml-[2.6rem] mr-2 space-y-px">
      {headings.map((heading) => {
        const active = heading.id === activeId;
        return (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={active ? "location" : undefined}
              onClick={() => setActiveId(heading.id)}
              className={cn(
                "block border-l-2 py-1 pr-1 text-[12px] leading-snug transition-colors",
                heading.depth === 2 ? "pl-2.5" : "pl-5 text-[11.5px]",
                active
                  ? "border-primary bg-primary/8 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {heading.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
