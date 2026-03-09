import { useState, useEffect } from "react";

/** Reference width (e.g. design base); below this we scale down. */
const REFERENCE_WIDTH = 390;
/** Minimum scale factor (e.g. for very small phones). */
const MIN_SCALE = 0.82;
/** Breakpoint below which scaling applies (matches lg: 1024px). */
const SCALE_BREAKPOINT = 1024;

/**
 * Returns a scale factor (MIN_SCALE to 1) based on viewport width for mobile.
 * On viewport >= SCALE_BREAKPOINT returns 1. Use for font-size, spacing, or dimensions in components.
 * @returns {{ scale: number, width: number, isMobile: boolean }}
 */
export function useViewportScale() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : REFERENCE_WIDTH
  );

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, []);

  const isMobile = width < SCALE_BREAKPOINT;
  const scale = isMobile
    ? Math.min(1, Math.max(MIN_SCALE, width / REFERENCE_WIDTH))
    : 1;

  return { scale, width, isMobile };
}

/**
 * Returns a value scaled by viewport (for use in style or dimensions).
 * @param {number} base - Base value at REFERENCE_WIDTH.
 * @param {{ scale: number }} [opts] - Optional { scale } from useViewportScale().
 * @returns {number}
 */
export function scaleByViewport(base, opts = {}) {
  if (typeof opts.scale === "number") return Math.round(base * opts.scale);
  if (typeof window !== "undefined" && window.innerWidth < SCALE_BREAKPOINT) {
    const s = Math.min(1, Math.max(MIN_SCALE, window.innerWidth / REFERENCE_WIDTH));
    return Math.round(base * s);
  }
  return base;
}
