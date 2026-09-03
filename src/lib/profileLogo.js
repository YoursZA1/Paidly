/**
 * Single source for the official Business Logo path used on invoices, quotes,
 * payslips, statements, profile chrome, and POS. DB: profiles.logo_url
 * (paidly bucket).
 */
export function resolveProfileLogoUrl(source) {
  if (!source || typeof source !== "object") return "";
  if (Object.prototype.hasOwnProperty.call(source, "logo_url")) {
    return String(source.logo_url || "").trim();
  }
  return String(source.company_logo_url || "").trim();
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
