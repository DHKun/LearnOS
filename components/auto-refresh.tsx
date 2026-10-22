"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Admin screens poll every 30 seconds (MVP-SPEC §0 / §3.2). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();

  React.useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);

  return null;
}
