import { resolveProfileLogoUrl } from "@/lib/profileLogo";

/**
 * Canonical business identity for documents, profile, and POS.
 * DB: profiles.logo_url (aliased as company_logo_url).
 */
export function resolveBusinessLogoUrl(source) {
  return resolveProfileLogoUrl(source);
}

/** Legacy column only — Settings no longer writes a separate POS logo. */
export function resolvePosLogoUrl(source) {
  if (!source || typeof source !== "object") return "";
  return String(source.pos_logo_url || "").trim();
}

/**
 * POS screen, till, and POS receipts use the official Business Logo.
 */
export function resolveEffectivePosLogoUrl(source) {
  return resolveBusinessLogoUrl(source);
}

/** Prefer a non-empty incoming POS logo; never wipe with an empty auth snapshot. */
export function mergePosLogo(prevLogo, source) {
  const incoming = resolvePosLogoUrl(typeof source === "object" ? source : { pos_logo_url: source });
  if (incoming) return incoming;
  return String(prevLogo || "").trim();
}
