"use client";

import * as React from "react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export function useConceptPlayback(total: number, initialStep: number) {
  const reduced = usePrefersReducedMotion();
  const [step, setStepState] = React.useState(() =>
    Math.max(0, Math.min(total - 1, initialStep)),
  );
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);

  React.useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  React.useEffect(() => {
    if (!playing || reduced) return;
    if (document.hidden) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepState((current) => {
        if (current >= total - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 2200 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, reduced, speed, step, total]);

  const setStep = React.useCallback(
    (next: number) => {
      setPlaying(false);
      setStepState(Math.max(0, Math.min(total - 1, next)));
    },
    [total],
  );

  const go = React.useCallback(
    (delta: number) => {
      setPlaying(false);
      setStepState((current) => Math.max(0, Math.min(total - 1, current + delta)));
    },
    [total],
  );

  const play = React.useCallback(() => {
    if (reduced) return;
    setStepState((current) => (current >= total - 1 ? 0 : current));
    setPlaying(true);
  }, [reduced, total]);

  return {
    step,
    setStep,
    go,
    playing,
    play,
    pause: () => setPlaying(false),
    toggle: () => (playing ? setPlaying(false) : play()),
    restart: () => {
      setPlaying(false);
      setStepState(0);
    },
    speed,
    setSpeed,
    reduced,
  };
}
