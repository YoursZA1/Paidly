/**
 * Session/display plan family. Legacy Individual/SME/Corporate map to the current catalog.
 * Does not write to the database — historical rows keep their original slug until an admin save.
 */
export function normalizePaidlyPlan(rawPlan) {
  const value = String(rawPlan || "").trim().toLowerCase();
  if (!value) return null;
  if (["individual", "starter", "free", "basic", "trial", "none"].includes(value) || value.startsWith("starter_")) {
    return "starter";
  }
  if (["sme", "professional", "business", "pro"].includes(value) || value.startsWith("business_")) {
    return "business";
  }
  if (["corporate", "growth"].includes(value) || value.startsWith("growth_")) return "growth";
  if (value === "enterprise" || value === "enterprise_custom") return "enterprise";
  return value;
}
