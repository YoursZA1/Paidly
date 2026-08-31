import {
  getPlanBySlug,
  normalizePlanSlug,
  familyForSlug,
  isLegacyPlanSlug,
  PUBLIC_PLAN_SLUGS,
} from "../subscriptionPlans.js";

const PLAN_SELECT =
  "id, slug, name, description, billing_cycle, amount, currency, payfast_item_name, features, active, plan_family, tier_rank, interval_months, limits, is_legacy, is_public, contact_sales, sort_order";

function mapPlanRow(data, source = "db") {
  if (!data?.id && source === "db") return null;
  return {
    id: data.id || null,
    slug: data.slug,
    name: data.name,
    description: data.description || "",
    billing_cycle: data.billing_cycle || "monthly",
    amount: Number(data.amount),
    currency: String(data.currency || "ZAR").toUpperCase(),
    payfast_item_name: data.payfast_item_name || data.name,
    features: data.features,
    plan_family: data.plan_family || familyForSlug(data.slug) || null,
    tier_rank: data.tier_rank != null ? Number(data.tier_rank) : null,
    interval_months: data.interval_months != null ? Number(data.interval_months) : 1,
    limits: data.limits || {},
    is_legacy: Boolean(data.is_legacy),
    is_public: data.is_public !== false,
    contact_sales: Boolean(data.contact_sales),
    sort_order: data.sort_order != null ? Number(data.sort_order) : 0,
    active: data.active !== false,
    source,
  };
}

/**
 * Load active public plan by slug (checkout). Falls back to shared/plans.js if row missing.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} slug
 */
export async function loadActivePlan(supabaseAdmin, slug) {
  const key = normalizePlanSlug(slug);
  if (!key) return null;
  if (isLegacyPlanSlug(key)) return null;
  if (!PUBLIC_PLAN_SLUGS.includes(/** @type {any} */ (key))) return null;

  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(PLAN_SELECT)
    .eq("slug", key)
    .eq("active", true)
    .maybeSingle();

  if (!error && data?.id) {
    return mapPlanRow(data, "db");
  }

  const fallback = getPlanBySlug(key);
  if (!fallback) return null;
  return mapPlanRow(
    {
      id: null,
      slug: key,
      name: fallback.name,
      description: "",
      billing_cycle: fallback.billing_cycle || "monthly",
      amount: Number(fallback.price),
      currency: "ZAR",
      payfast_item_name: `Paidly ${fallback.name}`,
      features: fallback.features,
      plan_family: fallback.family || familyForSlug(key),
      contact_sales: Boolean(fallback.contact_sales),
      active: true,
      is_public: true,
      is_legacy: false,
      interval_months: fallback.billing_cycle === "annual" ? 12 : 1,
      limits: {},
      sort_order: 0,
    },
    "shared_fallback"
  );
}

/**
 * Load any plan by id (including deactivated legacy) for ITN / grandfathered renewals.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} planId
 */
export async function loadPlanById(supabaseAdmin, planId) {
  if (!planId) return null;
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(PLAN_SELECT)
    .eq("id", planId)
    .maybeSingle();
  if (error || !data?.id) return null;
  return mapPlanRow(data, "db");
}

/**
 * Load any plan by slug including inactive legacy rows.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} slug
 */
export async function loadPlanBySlugAny(supabaseAdmin, slug) {
  const key = normalizePlanSlug(slug);
  if (!key) return null;
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(PLAN_SELECT)
    .eq("slug", key)
    .maybeSingle();
  if (!error && data?.id) return mapPlanRow(data, "db");
  return loadActivePlan(supabaseAdmin, key);
}

/**
 * Public catalog for pricing UI.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ includeInactive?: boolean }} [opts]
 */
export async function listPublicPlans(supabaseAdmin, opts = {}) {
  let q = supabaseAdmin
    .from("plans")
    .select(PLAN_SELECT)
    .eq("is_public", true)
    .order("sort_order", { ascending: true });

  if (!opts.includeInactive) {
    q = q.eq("active", true);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[plansCatalog] listPublicPlans failed", error.message);
    return [];
  }
  return (data || [])
    .map((row) => mapPlanRow(row, "db"))
    .filter((p) => p && !p.is_legacy);
}
