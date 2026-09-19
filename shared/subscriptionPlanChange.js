/**
 * Plan changes on an existing PayFast Recurring Billing agreement.
 *
 * PayFast bills the same token on its own schedule, so a change is a PATCH of the
 * recurring amount/frequency (no proration, no second agreement):
 *   - upgrade   → access now, new amount from the next billing date
 *   - downgrade → new amount from the next billing date, current access kept until then
 */

export const PLAN_CHANGE_DIRECTION = Object.freeze({
  UPGRADE: "upgrade",
  DOWNGRADE: "downgrade",
  SAME: "same",
});

function monthlyEquivalent(plan) {
  const amount = Number(plan?.amount) || 0;
  const months = Number(plan?.interval_months) || (String(plan?.billing_cycle || "").toLowerCase() === "annual" ? 12 : 1);
  return amount / Math.max(1, months);
}

/**
 * Tier rank decides first (Starter < Business < Growth); price per month breaks ties
 * (e.g. monthly ↔ annual of the same tier).
 * @param {{ slug?: string, tier_rank?: number|null, amount?: number, billing_cycle?: string, interval_months?: number }} current
 * @param {{ slug?: string, tier_rank?: number|null, amount?: number, billing_cycle?: string, interval_months?: number }} next
 */
export function planChangeDirection(current, next) {
  if (!current || !next) return PLAN_CHANGE_DIRECTION.UPGRADE;
  if (current.slug && next.slug && current.slug === next.slug) return PLAN_CHANGE_DIRECTION.SAME;
  const cr = current.tier_rank == null ? null : Number(current.tier_rank);
  const nr = next.tier_rank == null ? null : Number(next.tier_rank);
  if (cr != null && nr != null && cr !== nr) {
    return nr > cr ? PLAN_CHANGE_DIRECTION.UPGRADE : PLAN_CHANGE_DIRECTION.DOWNGRADE;
  }
  return monthlyEquivalent(next) >= monthlyEquivalent(current)
    ? PLAN_CHANGE_DIRECTION.UPGRADE
    : PLAN_CHANGE_DIRECTION.DOWNGRADE;
}

/**
 * A queued downgrade applies on the first successful charge on/after its date
 * (one day of slack for PayFast running early in SAST vs UTC).
 * @param {{ scheduled_plan_slug?: string|null, scheduled_change_at?: string|null }|null|undefined} sub
 * @param {Date} [now]
 */
export function scheduledPlanChangeDue(sub, now = new Date()) {
  if (!sub?.scheduled_plan_slug) return false;
  if (!sub.scheduled_change_at) return true;
  const at = new Date(sub.scheduled_change_at).getTime();
  if (!Number.isFinite(at)) return true;
  return now.getTime() >= at - 24 * 60 * 60 * 1000;
}
