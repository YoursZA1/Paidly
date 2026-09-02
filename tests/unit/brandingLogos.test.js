import { describe, expect, it } from "vitest";
import {
  mergePosLogo,
  resolveBusinessLogoUrl,
  resolveEffectivePosLogoUrl,
  resolvePosLogoUrl,
} from "@/lib/brandingLogos";

const businessA = { logo_url: "logo-a.png", company_logo_url: "ignored.png", pos_logo_url: "logo-b.png" };
const businessOnly = { logo_url: "logo-a.png" };

describe("brandingLogos", () => {
  it("business logo ignores POS logo", () => {
    expect(resolveBusinessLogoUrl(businessA)).toBe("logo-a.png");
    expect(resolveBusinessLogoUrl({ pos_logo_url: "logo-b.png" })).toBe("");
  });

  it("POS logo is optional and independent", () => {
    expect(resolvePosLogoUrl(businessA)).toBe("logo-b.png");
    expect(resolvePosLogoUrl(businessOnly)).toBe("");
  });

  it("effective POS logo falls back to business logo", () => {
    expect(resolveEffectivePosLogoUrl(businessA)).toBe("logo-b.png");
    expect(resolveEffectivePosLogoUrl(businessOnly)).toBe("logo-a.png");
    expect(resolveEffectivePosLogoUrl({})).toBe("");
  });

  it("removing POS logo falls back without wiping business logo", () => {
    expect(resolveEffectivePosLogoUrl({ logo_url: "logo-a.png", pos_logo_url: "" })).toBe("logo-a.png");
    expect(mergePosLogo("logo-b.png", { pos_logo_url: "" })).toBe("logo-b.png");
  });
});
