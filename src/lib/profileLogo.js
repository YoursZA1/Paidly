/**
 * Single source for the Business Logo path used on invoices, quotes, payslips,
 * statements, and profile chrome. DB: profiles.logo_url (paidly bucket).
 * POS uses src/lib/brandingLogos.js (pos_logo_url || logo_url).
 */
export function resolveProfileLogoUrl(source) {
  if (!source || typeof source !== "object") return "";
  const raw = source.logo_url ?? source.company_logo_url ?? "";
  return String(raw).trim();
}

/** Keep logo_url and legacy company_logo_url in sync for document templates. */
export function syncProfileLogoAliases(user) {
  if (!user || typeof user !== "object") return user;
  const logo = resolveProfileLogoUrl(user);
  return { ...user, logo_url: logo, company_logo_url: logo };
}

/** Prefer non-empty incoming logo; never wipe with empty auth/profile snapshot. */
export function mergeProfileLogo(prevLogo, source) {
  const incoming = resolveProfileLogoUrl(
    typeof source === "object" ? source : { logo_url: source }
  );
  if (incoming) return incoming;
  return String(prevLogo || "").trim();
}
