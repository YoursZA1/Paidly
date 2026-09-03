import { resolveProfileLogoUrl } from "@/lib/profileLogo";

/**
 * Canonical business identity for documents, profile chrome, and POS.
 * DB: profiles.logo_url (aliased as company_logo_url).
 */
export function resolveBusinessLogoUrl(source) {
  return resolveProfileLogoUrl(source);
}
