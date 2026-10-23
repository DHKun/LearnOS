"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Prefetch a chapter RSC payload only when the learner hovers/focuses it.
 * This keeps the initial page light (no 7-way prefetch storm) while still
 * making non-neighbour chapter switches feel instant on pointer devices.
 */
export function PrefetchOnHover({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const last = React.useRef<string | null>(null);

  const prefetch = React.useCallback(
    (target: EventTarget | null) => {
      const element = target as Element | null;
      const anchor = element?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = `${url.pathname}${url.search}`;
      if (last.current === href) return;
      last.current = href;
      router.prefetch(href);
    },
    [router],
  );

  return (
    <div
      className="contents"
      onMouseOver={(event) => prefetch(event.target)}
      onFocus={(event) => prefetch(event.target)}
      onPointerDown={(event) => prefetch(event.target)}
      onTouchStart={(event) => prefetch(event.target)}
    >
      {children}
    </div>
  );
}
