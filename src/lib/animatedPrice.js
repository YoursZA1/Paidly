import { formatMarketingZar } from "@shared/planMarketing.js";

export const PRICE_COUNT_DURATION_MS = 600;

/** Cubic ease-out: fast start, settle on the target. */
export function easeOutCubic(t) {
  const clamped = Math.min(1, Math.max(0, Number(t) || 0));
  return 1 - (1 - clamped) ** 3;
}

export function interpolateEaseOut(from, to, t) {
  const start = Number(from);
  const end = Number(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return end;
  return start + (end - start) * easeOutCubic(t);
}

/** Whole-rand step so R50 → R49 → … is visible. */
export function countPriceFrame(from, to, t) {
  return Math.round(interpolateEaseOut(from, to, t));
}

export function marketingZarNumericPart(amount, opts = {}) {
  const label = formatMarketingZar(amount, opts);
  if (!label.startsWith("R")) return label;
  return label.slice(1);
}
