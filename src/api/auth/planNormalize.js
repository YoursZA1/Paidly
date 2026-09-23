/**
 * Session/display plan family. Legacy Individual/SME/Corporate map to the current catalog.
 * Does not write to the database — historical rows keep their original slug until an admin save.
 */
export function normalizePaidlyPlan(rawPlan) {
  const value = String(rawPlan || "").trim().toLowerCase();
  // trial / free / none are statuses (or no package), never an implicit Starter.
  if (!value || ["free", "trial", "none"].includes(value)) return null;
  if (["individual", "starter", "basic"].includes(value) || value.startsWith("starter_")) {
    return "starter";
  }
  if (["sme", "professional", "business", "pro"].includes(value) || value.startsWith("business_")) {
    return "business";
  }
  if (["corporate", "growth"].includes(value) || value.startsWith("growth_")) return "growth";
  if (value === "enterprise" || value === "enterprise_custom") return "enterprise";
  return value;
}
