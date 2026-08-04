import { getPlanBySlug, normalizePlanSlug } from "../subscriptionPlans.js";

/**
 * Load plan from public.plans (SoR). Falls back to shared/plans.js if row missing.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} slug
 */
export async function loadActivePlan(supabaseAdmin, slug) {
  const key = normalizePlanSlug(slug);
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("id, slug, name, description, billing_cycle, amount, currency, payfast_item_name, features, active")
    .eq("slug", key)
    .eq("active", true)
    .maybeSingle();

  if (!error && data?.id) {
    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      description: data.description || "",
      billing_cycle: data.billing_cycle || "monthly",
      amount: Number(data.amount),
      currency: String(data.currency || "ZAR").toUpperCase(),
      payfast_item_name: data.payfast_item_name || data.name,
      features: data.features,
      source: "db",
    };
  }

  const fallback = getPlanBySlug(key);
  if (!fallback) return null;
  return {
    id: null,
    slug: key,
    name: fallback.name,
    description: "",
    billing_cycle: "monthly",
    amount: Number(fallback.price),
    currency: "ZAR",
    payfast_item_name: `Paidly ${fallback.name}`,
    features: fallback.features,
    source: "shared_fallback",
  };
}
