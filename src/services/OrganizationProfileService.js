import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { normalizeBusinessType } from "@shared/businessType.js";

/**
 * Update tenant company profile on organizations (company_id = org_id).
 * @param {string} orgId
 * @param {Record<string, unknown>} patch
 */
export async function updateOrganizationProfile(orgId, patch) {
  if (!orgId) throw new Error("Company ID is required");

  const payload = {};
  const allowed = [
    "name",
    "registration_number",
    "company_email",
    "phone",
    "industry",
    "address",
    "business_type",
    "payroll_settings",
    "tax_info",
    "onboarding_completed_at",
  ];

  for (const key of allowed) {
    if (patch[key] !== undefined) payload[key] = patch[key];
  }

  if (payload.business_type !== undefined) {
    payload.business_type = normalizeBusinessType(payload.business_type);
  }

  if (!Object.keys(payload).length) return null;

  const { data, error } = await supabase
    .from("organizations")
    .update(payload)
    .eq("id", orgId)
    .select("id, name, registration_number, company_email, phone, industry, address, business_type")
    .maybeSingle();

  if (error) throw new Error(getSupabaseErrorMessage(error, "Could not save company profile"));
  return data;
}

/**
 * @param {string} orgId
 */
export async function fetchOrganizationProfile(orgId) {
  if (!orgId) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, registration_number, company_email, phone, industry, address, business_type, payroll_settings, tax_info, onboarding_completed_at"
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(getSupabaseErrorMessage(error, "Could not load company profile"));
  return data;
}
