import { describe, expect, it } from "vitest";
import {
  composeLogoOverridePath,
  resolveIssuerBrand,
  resolveIssuerName,
  resolveIssuerLogoPath,
  snapshotFieldsFromIssuerBrand,
  snapshotForNewDocument,
} from "@/lib/documentIssuerBrand";

const brandA = { id: "brand-a", name: "Company A", logo_url: "logo-a.png" };
const brandB = { id: "brand-b", name: "Company B", logo_url: "logo-b.png" };
const profile = { company_name: "Org Default", logo_url: "org-logo.png" };

describe("documentIssuerBrand", () => {
  it("uses compose company name before assigned brand", () => {
    expect(
      resolveIssuerName({
        document: { company_name: "On this invoice", owner_company_name: "Snapshot A" },
        company: brandA,
        profile,
      })
    ).toBe("On this invoice");
  });

  it("uses assigned brand over snapshot and profile", () => {
    expect(
      resolveIssuerName({
        document: { owner_company_name: "Snapshot A" },
        company: brandA,
        profile,
        selectedBrand: brandB,
      })
    ).toBe("Company A");
  });

  it("uses snapshot when no brand is assigned", () => {
    expect(
      resolveIssuerName({
        document: { owner_company_name: "Snapshot A" },
        company: null,
        profile,
      })
    ).toBe("Snapshot A");
  });

  it("falls back to organization profile", () => {
    expect(resolveIssuerName({ document: {}, company: null, profile })).toBe("Org Default");
  });

  it("does not apply a globally selected brand to a saved document with an assigned brand", () => {
    expect(
      resolveIssuerName({
        document: { owner_company_name: "Snapshot A" },
        company: brandA,
        profile,
        selectedBrand: brandB,
      })
    ).toBe("Company A");
    expect(
      resolveIssuerLogoPath({
        document: { owner_logo_url: "snap-a.png" },
        company: brandA,
        profile,
        selectedBrand: brandB,
      })
    ).toBe("logo-a.png");
  });

  it("live Business Logo beats a stale document snapshot", () => {
    expect(
      resolveIssuerLogoPath({
        document: { owner_logo_url: "old-snap.png" },
        company: null,
        profile: { logo_url: "new-logo.png" },
      })
    ).toBe("new-logo.png");
  });

  it("uses a compose logo override before brand and snapshot", () => {
    expect(
      resolveIssuerLogoPath({
        document: { document_logo_url: "override.png", owner_logo_url: "snap-a.png" },
        company: brandA,
        profile,
      })
    ).toBe("override.png");
  });

  it("snapshotForNewDocument writes companyId only for the given brand", () => {
    const snapA = snapshotForNewDocument({ brand: brandA, profile });
    const snapB = snapshotForNewDocument({ brand: brandB, profile });
    expect(snapA.companyId).toBe("brand-a");
    expect(snapA.owner_company_name).toBe("Company A");
    expect(snapB.companyId).toBe("brand-b");
    expect(snapA.companyId).not.toBe(snapB.companyId);
  });

  it("organization default snapshot has no companyId", () => {
    const snap = snapshotForNewDocument({ brand: null, profile });
    expect(snap.companyId).toBeNull();
    expect(snap.owner_company_name).toBe("Org Default");
    expect(snap.owner_logo_url).toBe("org-logo.png");
  });

  it("uses the official Business Logo from profile.logo_url", () => {
    const mixed = {
      company_name: "Org Default",
      logo_url: "org-logo.png",
      company_logo_url: "ignored-alias.png",
    };
    expect(resolveIssuerLogoPath({ document: {}, company: null, profile: mixed })).toBe("org-logo.png");
    expect(snapshotForNewDocument({ brand: null, profile: mixed }).owner_logo_url).toBe("org-logo.png");
  });

  it("resolveIssuerBrand is the single decision for preview and save", () => {
    const args = {
      document: { company_name: "On this invoice", owner_logo_url: "old-snap.png" },
      company: null,
      profile: { company_name: "Org Default", logo_url: "logo-a.png" },
    };
    const issuerBrand = resolveIssuerBrand(args);
    expect(issuerBrand.logo).toBe("logo-a.png");
    expect(issuerBrand.name).toBe("On this invoice");
    expect(snapshotFieldsFromIssuerBrand(issuerBrand)).toEqual({
      owner_company_name: "On this invoice",
      owner_logo_url: "logo-a.png",
      company_id: null,
    });
  });

  it("reuses a resolved issuerBrand instead of re-running fallbacks", () => {
    const resolved = { name: "Locked Name", logo: "locked.png", companyId: "brand-a" };
    expect(
      resolveIssuerBrand({
        document: { issuerBrand: resolved, owner_logo_url: "other.png" },
        company: brandB,
        profile,
      })
    ).toBe(resolved);
  });

  it("falls back to the document snapshot when there is no Business Logo", () => {
    expect(
      resolveIssuerBrand({
        document: { owner_logo_url: "snap-only.png" },
        company: null,
        profile: { company_name: "Org Default", logo_url: "" },
      }).logo
    ).toBe("snap-only.png");
  });

  it("treats only document-logos paths as compose overrides", () => {
    expect(composeLogoOverridePath("logo-a.png")).toBe("");
    expect(composeLogoOverridePath("document-logos/user/abc.png")).toBe("document-logos/user/abc.png");
  });
});
