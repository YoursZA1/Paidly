/**
 * Commercial document issuer (invoices + quotes).
 * Not POS till chrome. POS uses register/profile branding separately.
 */

function firstText(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

/**
 * Drop a spoofed company_id that does not belong to the document org.
 * Companies without org_id (already org-scoped loads / tests) are accepted.
 */
export function companyBelongsToOrg(company, orgId) {
  if (!company?.id) return false;
  if (!orgId || !company.org_id) return true;
  return String(company.org_id) === String(orgId);
}

export function sanitizeCompanyIdForOrg(companyId, orgCompanies = [], orgId = null) {
  const id = String(companyId || "").trim();
  if (!id) return null;
  const match = (Array.isArray(orgCompanies) ? orgCompanies : []).find((row) => String(row?.id) === id);
  if (!match) return null;
  if (!companyBelongsToOrg(match, orgId)) return null;
  return id;
}

export function resolveIssuerVat({ document, company, profile } = {}) {
  return firstText(
    document?.owner_vat_number,
    document?.vat_number,
    company?.vat_number,
    profile?.vat_number,
    profile?.business?.vat_number,
    profile?.business?.tax_id
  );
}

export function resolveIssuerAddress({ document, company, profile } = {}) {
  return firstText(document?.owner_company_address, company?.address, profile?.company_address);
}

export function resolveIssuerEmail({ document, company, profile } = {}) {
  return firstText(document?.owner_email, company?.email, profile?.email, profile?.company_email);
}

export function resolveIssuerPhone({ document, company, profile } = {}) {
  return firstText(document?.owner_phone, company?.phone, profile?.phone);
}

export function resolveIssuerWebsite({ document, company, profile } = {}) {
  return firstText(document?.owner_website, company?.website, profile?.company_website, profile?.website);
}

/**
 * Commercial logo: document/company branding only.
 * POS till logos must not be passed in as `company` or `profile`.
 */
export function resolveCommercialIssuerLogo({ document, company, profile, selectedBrand } = {}) {
  const compose = firstText(document?.document_logo_url);
  if (compose) return compose;
  const brandLogo = firstText(company?.logo_url);
  if (brandLogo) return brandLogo;
  const snapshot = firstText(document?.owner_logo_url);
  if (snapshot) return snapshot;
  const selected = firstText(selectedBrand?.logo_url);
  if (selected) return selected;
  return firstText(profile?.logo_url, profile?.company_logo_url);
}

export function resolveCommercialIssuerName({ document, company, profile, selectedBrand } = {}) {
  return firstText(
    document?.company_name,
    company?.name,
    document?.owner_company_name,
    selectedBrand?.name,
    profile?.company_name
  );
}

/**
 * Single issuer object for compose, persist, preview, PDF, and conversion.
 */
export function resolveCommercialIssuer({
  document,
  company,
  profile,
  selectedBrand,
  orgId,
} = {}) {
  const assigned = company && companyBelongsToOrg(company, orgId) ? company : null;
  const name = resolveCommercialIssuerName({ document, company: assigned, profile, selectedBrand });
  const logo = resolveCommercialIssuerLogo({ document, company: assigned, profile, selectedBrand });

  return {
    orgId: orgId || document?.org_id || null,
    companyId: assigned?.id || document?.company_id || selectedBrand?.id || null,
    name,
    logo,
    address: resolveIssuerAddress({ document, company: assigned, profile }),
    email: resolveIssuerEmail({ document, company: assigned, profile }),
    phone: resolveIssuerPhone({ document, company: assigned, profile }),
    website: resolveIssuerWebsite({ document, company: assigned, profile }),
    vatNumber: resolveIssuerVat({ document, company: assigned, profile }),
    currency: firstText(document?.owner_currency, document?.currency, profile?.currency) || "ZAR",
    brandPrimary: firstText(document?.document_brand_primary, profile?.document_brand_primary),
    brandSecondary: firstText(document?.document_brand_secondary, profile?.document_brand_secondary),
    bankingDetailId: document?.banking_detail_id || null,
  };
}

export function snapshotFieldsFromCommercialIssuer(issuer) {
  return {
    company_id: issuer?.companyId || null,
    owner_company_name: issuer?.name || null,
    owner_logo_url: issuer?.logo || null,
    owner_company_address: issuer?.address || null,
    owner_email: issuer?.email || null,
    owner_phone: issuer?.phone || null,
    owner_vat_number: issuer?.vatNumber || null,
    owner_currency: issuer?.currency || null,
    document_brand_primary: issuer?.brandPrimary || null,
    document_brand_secondary: issuer?.brandSecondary || null,
  };
}

export function hasResolvedCommercialIssuer(value) {
  return Boolean(value && typeof value === "object" && "logo" in value && "name" in value && "companyId" in value);
}
