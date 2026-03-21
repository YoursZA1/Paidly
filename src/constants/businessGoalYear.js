/**
 * Calendar year for dashboard revenue targets (`business_goals.year`).
 * Call at runtime (not a module-level constant) so a long-lived SPA stays correct after New Year without reload.
 */
export function getBusinessGoalYear() {
  return new Date().getFullYear();
}
