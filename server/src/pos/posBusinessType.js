import { supabaseAdmin } from "../supabaseAdmin.js";
import { businessTypeIncludesPos, normalizeBusinessType, posExperienceFor } from "../../../shared/businessType.js";

function columnMissing(message) {
  return /business_type|schema cache|column .* does not exist/i.test(String(message || ""));
}

/**
 * Whether this org opted into POS (retail or mixed).
 * Missing column (migration not applied) does not block an existing till.
 * @param {string} orgId
 */
export async function orgHasPosCapability(orgId) {
  if (!orgId) return false;
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("business_type")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    if (columnMissing(error.message)) return true;
    console.warn("[pos] business_type lookup", error.message);
    return false;
  }
  return businessTypeIncludesPos(data?.business_type);
}

/**
 * @param {import("http").ServerResponse} res
 * @param {string} orgId
 * @returns {Promise<boolean>}
 */
export async function requirePosCapability(res, orgId) {
  const ok = await orgHasPosCapability(orgId);
  if (ok) return true;
  res.status(403).json({
    error: "POS is not enabled for this business type. Choose Retail, Mixed or Restaurant in Settings → Company Profile.",
    code: "POS_NOT_ENABLED",
  });
  return false;
}

/**
 * The org's business type (normalized), or null when unset / the column is missing.
 * @param {string} orgId
 */
export async function loadOrgBusinessType(orgId) {
  if (!orgId) return null;
  const { data, error } = await supabaseAdmin.from("organizations").select("business_type").eq("id", orgId).maybeSingle();
  if (error) {
    if (!columnMissing(error.message)) console.warn("[pos] business_type lookup", error.message);
    return null;
  }
  return normalizeBusinessType(data?.business_type);
}

/**
 * What the till offers this org (see shared posExperienceFor): restaurant features and services.
 * @param {string} orgId
 */
export async function loadOrgPosExperience(orgId) {
  return posExperienceFor(await loadOrgBusinessType(orgId));
}
