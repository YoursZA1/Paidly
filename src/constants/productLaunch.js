/** Public launch target (marketing copy). */
export const PRODUCT_LAUNCH_DATE_LABEL = "31 March 2026";

/**
 * Countdown target: end of 31 March 2026 UTC (23:59:59.999Z).
 * Matches “by end of 31 March 2026” for a single global moment.
 */
export const PRODUCT_LAUNCH_DEADLINE_MS = Date.UTC(2026, 2, 31, 23, 59, 59, 999);

/** Longer subtitle for waitlist sections. */
export const PRODUCT_LAUNCH_SUBTITLE = `We’re putting the finishing touches on Paidly. Join the waitlist and we’ll email you before we go live — target launch by ${PRODUCT_LAUNCH_DATE_LABEL}.`;

/**
 * Human-readable time remaining until {@link PRODUCT_LAUNCH_DEADLINE_MS}.
 * @returns {string} e.g. "27 days, 4 hours"
 */
export function getProductLaunchTimeLeftPhrase() {
  const end = PRODUCT_LAUNCH_DEADLINE_MS;
  const now = Date.now();
  if (now >= end) return "Launch window is here";

  const totalSeconds = Math.max(0, Math.floor((end - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0 && days === 0 && hours < 12) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return "less than a minute";
  return parts.join(", ");
}

/**
 * Copy for the post-signup waitlist dialog.
 */
export function getWaitlistThankYouMessage() {
  const timeLeft = getProductLaunchTimeLeftPhrase();
  return {
    title: "Thanks for joining the waitlist!",
    description: `Be one of the few to get the news when we go live on ${PRODUCT_LAUNCH_DATE_LABEL}. ${timeLeft} left.`,
  };
}
