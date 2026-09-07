/**
 * Issuer branding for commercial invoices and quotes.
 *
 * Vocabulary:
 *   Organization = Paidly tenant (organizations / CompanyContext.companyId)
 *   Brand        = public.companies row (invoices.company_id / quotes.company_id)
 *   Profile      = organization default on profiles
 *
 * Commercial logo comes from document/company branding — not POS till chrome.
 * POS uses profiles.logo_url / register branding separately.
 *
 * New documents use the active brand as a default only. Changing the global
 * active brand must not mutate existing rows.
 */
import { resolveBusinessLogoUrl } from "@/lib/brandingLogos";
import {
  hasResolvedCommercialIssuer,
  resolveCommercialIssuer,
  resolveCommercialIssuerLogo,
  resolveCommercialIssuerName,
  snapshotFieldsFromCommercialIssuer,
} from "@shared/commercial/resolveCommercialIssuer.js";

export function resolveIssuerName(args = {}) {
  return resolveCommercialIssuerName(args);
}

export function resolveIssuerLogoPath(args = {}) {
  return resolveCommercialIssuerLogo(args);
}

export function hasResolvedIssuerBrand(value) {
  return hasResolvedCommercialIssuer(value);
}

/**
 * Single issuer-brand decision for compose, preview, save, PDF, and public views.
 */
export function resolveIssuerBrand(args = {}) {
  if (hasResolvedCommercialIssuer(args.document?.issuerBrand)) {
    return args.document.issuerBrand;
  }
  const issuer = resolveCommercialIssuer(args);
  return {
    name: issuer.name,
    logo: issuer.logo,
    companyId: issuer.companyId,
    address: issuer.address,
    email: issuer.email,
    phone: issuer.phone,
    website: issuer.website,
    vatNumber: issuer.vatNumber,
    currency: issuer.currency,
    brandPrimary: issuer.brandPrimary,
    brandSecondary: issuer.brandSecondary,
    bankingDetailId: issuer.bankingDetailId,
    orgId: issuer.orgId,
  };
}

export function snapshotFieldsFromIssuerBrand(issuerBrand) {
  return snapshotFieldsFromCommercialIssuer(issuerBrand);
}

/**
 * Only `document-logos/...` uploads are compose overrides.
 */
export function composeLogoOverridePath(path) {
  const s = String(path || "").trim();
  return s.startsWith("document-logos/") ? s : "";
}

/**
 * Snapshot written onto a new invoice or quote, including company_id.
 */
export function snapshotForNewDocument({ brand, profile } = {}) {
  const brandId = brand?.id ? String(brand.id) : null;
  const issuer = resolveCommercialIssuer({
    company: brand || null,
    profile,
    selectedBrand: brand || null,
  });
  return {
    companyId: brandId,
    owner_company_name: issuer.name || profile?.company_name || null,
    owner_logo_url:
      (brand?.logo_url && String(brand.logo_url).trim()) ||
      issuer.logo ||
      resolveBusinessLogoUrl(profile) ||
      null,
    owner_company_address: issuer.address || profile?.company_address || null,
    owner_email: issuer.email || profile?.email || profile?.company_email || null,
    owner_phone: issuer.phone || profile?.phone || null,
    owner_vat_number: issuer.vatNumber || null,
    owner_currency: issuer.currency || profile?.currency || null,
  };
}
