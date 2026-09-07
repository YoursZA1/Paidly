import { describe, expect, it } from "vitest";
import {
  companyBelongsToOrg,
  resolveCommercialIssuer,
  sanitizeCompanyIdForOrg,
  snapshotFieldsFromCommercialIssuer,
} from "@shared/commercial/resolveCommercialIssuer.js";

const orgId = "org-1";
const brand = {
  id: "brand-a",
  org_id: orgId,
  name: "Ridge Electrical",
  logo_url: "brand-logo.png",
  vat_number: "4123456789",
  address: "12 Main Rd",
  email: "accounts@ridge.test",
  phone: "+27 21 000 0000",
};
const profile = {
  company_name: "Org Default",
  logo_url: "org-logo.png",
  company_address: "Org address",
  email: "hello@org.test",
  phone: "+27 11 111 1111",
  business: { vat_number: "ORGVAT" },
  document_brand_primary: "#111",
};

describe("company_id org validation", () => {
  it("rejects a company from another organisation", () => {
    expect(companyBelongsToOrg({ id: "brand-b", org_id: "other-org" }, orgId)).toBe(false);
    expect(sanitizeCompanyIdForOrg("brand-b", [{ id: "brand-b", org_id: "other-org" }], orgId)).toBeNull();
  });

  it("accepts a company that belongs to the org", () => {
    expect(companyBelongsToOrg(brand, orgId)).toBe(true);
    expect(sanitizeCompanyIdForOrg("brand-a", [brand], orgId)).toBe("brand-a");
  });

  it("drops a company_id that is not in the org list", () => {
    expect(sanitizeCompanyIdForOrg("missing", [brand], orgId)).toBeNull();
  });
});

describe("commercial issuer resolution", () => {
  it("resolves company, contact, VAT, and branding from the assigned brand", () => {
    const issuer = resolveCommercialIssuer({
      document: { org_id: orgId, company_id: "brand-a", banking_detail_id: "bank-1" },
      company: brand,
      profile,
      orgId,
    });
    expect(issuer.companyId).toBe("brand-a");
    expect(issuer.name).toBe("Ridge Electrical");
    expect(issuer.logo).toBe("brand-logo.png");
    expect(issuer.address).toBe("12 Main Rd");
    expect(issuer.email).toBe("accounts@ridge.test");
    expect(issuer.phone).toBe("+27 21 000 0000");
    expect(issuer.vatNumber).toBe("4123456789");
    expect(issuer.bankingDetailId).toBe("bank-1");
  });

  it("does not use a spoofed company from another org", () => {
    const issuer = resolveCommercialIssuer({
      document: { company_name: "", owner_company_name: "Snapshot" },
      company: { id: "evil", org_id: "other", name: "Evil Co", logo_url: "evil.png" },
      profile,
      orgId,
    });
    expect(issuer.name).toBe("Snapshot");
    expect(issuer.logo).not.toBe("evil.png");
  });

  it("uses document/company logo, not a later live profile logo", () => {
    const issuer = resolveCommercialIssuer({
      document: { owner_logo_url: "doc-snap.png" },
      company: null,
      profile: { ...profile, logo_url: "new-pos-or-profile.png" },
    });
    expect(issuer.logo).toBe("doc-snap.png");
  });

  it("snapshots persistable issuer fields including company_id", () => {
    const issuer = resolveCommercialIssuer({ company: brand, profile, orgId });
    expect(snapshotFieldsFromCommercialIssuer(issuer)).toMatchObject({
      company_id: "brand-a",
      owner_company_name: "Ridge Electrical",
      owner_logo_url: "brand-logo.png",
      owner_vat_number: "4123456789",
    });
  });
});
