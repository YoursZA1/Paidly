/**
 * Issuer branding for commercial documents.
 *
 * Vocabulary:
 *   Organization = Paidly tenant (organizations / CompanyContext.companyId)
 *   Brand        = public.companies row (invoices.company_id)
 *   Profile      = organization default on profiles
 *
 * Render precedence:
 *   1. Document-specific compose override (company_name / document_logo_url)
 *   2. Assigned brand (invoice.company from companies) when that brand has its own logo
 *   3. Live Business Logo (profiles.logo_url) — latest uploaded / updated logo
 *   4. Document snapshot (owner_*) as fallback when the live logo is empty
 *
 * POS uses the same Business Logo (profiles.logo_url).
 *
 * New documents use the active brand as a default only. Changing the global
 * active brand must not mutate existing rows.
 */
import { resolveBusinessLogoUrl } from "@/lib/brandingLogos";

/**
 * @param {{ document?: object, company?: object, profile?: object, selectedBrand?: object }} args
 */
export function resolveIssuerName({ document, company, profile, selectedBrand } = {}) {
  const composeName = document?.company_name && String(document.company_name).trim();
  if (composeName) return composeName;
  const companyName = company?.name && String(company.name).trim();
  if (companyName) return companyName;
  const snapshot = document?.owner_company_name && String(document.owner_company_name).trim();
  if (snapshot) return snapshot;
  const selected = selectedBrand?.name && String(selectedBrand.name).trim();
  if (selected) return selected;
  const profileName = profile?.company_name && String(profile.company_name).trim();
  return profileName || null;
}

/**
 * @param {{ document?: object, company?: object, profile?: object, selectedBrand?: object }} args
 */
export function resolveIssuerLogoPath({ document, company, profile, selectedBrand } = {}) {
  const composeOverride = document?.document_logo_url && String(document.document_logo_url).trim();
  if (composeOverride) return composeOverride;
  const companyLogo = company?.logo_url && String(company.logo_url).trim();
  if (companyLogo) return companyLogo;
  const liveLogo = resolveBusinessLogoUrl(profile);
  if (liveLogo) return liveLogo;
  const snapshot = document?.owner_logo_url && String(document.owner_logo_url).trim();
  if (snapshot) return snapshot;
  const selected = selectedBrand?.logo_url && String(selectedBrand.logo_url).trim();
  if (selected) return selected;
  return null;
}

/**
 * True when `value` is an already-resolved issuer brand from this module.
 * Downstream renderers must consume it instead of re-running fallbacks.
 * @param {unknown} value
 */
export function hasResolvedIssuerBrand(value) {
  return Boolean(value && typeof value === "object" && "logo" in value && "name" in value);
}

/**
 * Single issuer-brand decision for compose, preview, save, PDF, and public views.
 * If `document.issuerBrand` is already resolved, that object is returned unchanged.
 *
 * @param {{ document?: object, company?: object, profile?: object, selectedBrand?: object }} args
 * @returns {{ name: string | null, logo: string | null, companyId: string | null }}
 */
export function resolveIssuerBrand(args = {}) {
  if (hasResolvedIssuerBrand(args.document?.issuerBrand)) {
    return args.document.issuerBrand;
  }
  const company = args.company || args.selectedBrand || null;
  return {
    name: resolveIssuerName({ ...args, company }),
    logo: resolveIssuerLogoPath({ ...args, company }),
    companyId: company?.id || args.document?.company_id || null,
  };
}

/**
 * Persistable snapshot fields taken from a resolved issuer brand.
 * Preview and save must use the same `issuerBrand` object.
 * @param {{ name?: string | null, logo?: string | null, companyId?: string | null }} issuerBrand
 */
export function snapshotFieldsFromIssuerBrand(issuerBrand) {
  return {
    owner_company_name: issuerBrand?.name || null,
    owner_logo_url: issuerBrand?.logo || null,
    company_id: issuerBrand?.companyId || null,
  };
}

/**
 * Only `document-logos/...` uploads are compose overrides.
 * Snapshot or brand paths must not be copied into `document_logo_url`.
 * @param {unknown} path
 * @returns {string}
 */
export function composeLogoOverridePath(path) {
  const s = String(path || "").trim();
  return s.startsWith("document-logos/") ? s : "";
}

/**
 * Snapshot written onto a new invoice/quote. Invoice also gets company_id.
 * Quotes/payslips have no company_id column — name/logo snapshot only.
 *
 * @param {{ brand?: { id?: string, name?: string, logo_url?: string } | null, profile?: object }} args
 */
export function snapshotForNewDocument({ brand, profile } = {}) {
  const brandId = brand?.id ? String(brand.id) : null;
  return {
    companyId: brandId,
    owner_company_name: (brand?.name && String(brand.name).trim()) || profile?.company_name || null,
    owner_logo_url:
      (brand?.logo_url && String(brand.logo_url).trim()) || resolveBusinessLogoUrl(profile) || null,
    owner_company_address: profile?.company_address || null,
    owner_email: profile?.email || profile?.company_email || null,
  };
}
