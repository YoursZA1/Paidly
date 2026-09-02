import { resolveProfileLogoUrl } from "@/lib/profileLogo";

/**
 * Canonical business / document identity.
 * DB: profiles.logo_url (aliased as company_logo_url).
 * Never read profiles.pos_logo_url here — invoices, quotes, payslips, and
 * statements must not pick up POS branding.
 */
export function resolveBusinessLogoUrl(source) {
  return resolveProfileLogoUrl(source);
}

/** Optional POS-only logo. DB: profiles.pos_logo_url */
export function resolvePosLogoUrl(source) {
  if (!source || typeof source !== "object") return "";
  return String(source.pos_logo_url || "").trim();
}

/**
 * POS screen, till, and POS receipts.
 * POS logo when set; otherwise the business logo. Documents never use this.
 */
export function resolveEffectivePosLogoUrl(source) {
  return resolvePosLogoUrl(source) || resolveBusinessLogoUrl(source);
}

/** Prefer a non-empty incoming POS logo; never wipe with an empty auth snapshot. */
export function mergePosLogo(prevLogo, source) {
  const incoming = resolvePosLogoUrl(typeof source === "object" ? source : { pos_logo_url: source });
  if (incoming) return incoming;
  return String(prevLogo || "").trim();
}
