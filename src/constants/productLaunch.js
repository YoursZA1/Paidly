/** Public launch target (marketing copy). */
export const PRODUCT_LAUNCH_DATE_LABEL = "31 March 2026";

/**
 * Countdown target: end of 31 March 2026 UTC (23:59:59.999Z).
 * Matches “by end of 31 March 2026” for a single global moment.
 */
export const PRODUCT_LAUNCH_DEADLINE_MS = Date.UTC(2026, 2, 31, 23, 59, 59, 999);

/** Short badge line for nav/hero. */
export const PRODUCT_LAUNCH_BADGE = `Launching by ${PRODUCT_LAUNCH_DATE_LABEL}`;

/** Longer subtitle for waitlist sections. */
export const PRODUCT_LAUNCH_SUBTITLE = `We’re putting the finishing touches on Paidly. Join the waitlist and we’ll email you before we go live — target launch by ${PRODUCT_LAUNCH_DATE_LABEL}.`;
