export function normalizePaidlyPlan(rawPlan) {
  const value = String(rawPlan || "").trim().toLowerCase();
  if (!value) return null;
  if (["individual", "starter", "free", "basic", "trial", "none"].includes(value)) return "individual";
  if (["sme", "professional", "business"].includes(value)) return "sme";
  if (["corporate", "enterprise", "pro"].includes(value)) return "corporate";
  return value;
}
