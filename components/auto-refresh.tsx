"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Admin screens poll every 30 seconds (MVP-SPEC §0 / §3.2). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const start = () => {
      if (!timer) timer = setInterval(refresh, seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        refresh();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return null;
}
