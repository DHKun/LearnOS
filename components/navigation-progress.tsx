"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Global top progress bar. It starts on a same-origin navigation click and
 * clears when the pathname changes, covering Server Component fetches with an
 * immediate visual response.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    setActive(false);
  }, [pathname]);

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const element = event.target as Element | null;
      const anchor = element?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      setActive(true);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/20"
      role="progressbar"
      aria-label="页面加载中"
    >
      <div className="nav-progress-bar h-full w-1/3 rounded-full bg-primary" />
    </div>
  );
}
