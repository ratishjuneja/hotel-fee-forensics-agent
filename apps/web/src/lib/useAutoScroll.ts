"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the latest revealed element re-centered in the viewport as staged
 * content appears (agent trace steps, parse progress). Attach the returned ref
 * to the element that should stay in view — usually a sentinel after the last
 * revealed item — and pass a `key` that changes each time new content lands
 * (e.g. the count of visible steps). Honors prefers-reduced-motion: it still
 * re-centers, just without the smooth-scroll animation.
 */
export function useAutoScroll<T extends HTMLElement>(
  key: unknown,
  { enabled = true, block = "center" as ScrollLogicalPosition } = {},
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, block]);
  return ref;
}
