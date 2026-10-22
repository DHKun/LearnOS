"use client";

import * as React from "react";

/** Sends a ~60s heartbeat while the page is visible; keeps presence separate from interaction. */
export function LearningHeartbeat({
  enrollmentId,
  lessonId,
}: {
  enrollmentId: string;
  lessonId: string | null;
}) {
  React.useEffect(() => {
    let disposed = false;

    async function beat() {
      if (disposed || document.visibilityState === "hidden") return;
      try {
        await fetch("/api/learning/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            enrollmentId,
            lessonId,
            visible: document.visibilityState === "visible",
            focused: document.hasFocus(),
          }),
        });
      } catch {
        // Heartbeats are best-effort telemetry.
      }
    }

    void beat();
    const timer = setInterval(() => void beat(), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void beat();
    };
    const onFocus = () => void beat();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enrollmentId, lessonId]);

  return null;
}
