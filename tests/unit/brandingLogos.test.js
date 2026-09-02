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

  it("legacy POS column is still readable but unused for display", () => {
    expect(resolvePosLogoUrl(businessA)).toBe("logo-b.png");
    expect(resolvePosLogoUrl(businessOnly)).toBe("");
  });

  it("POS till uses the official Business Logo", () => {
    expect(resolveEffectivePosLogoUrl(businessA)).toBe("logo-a.png");
    expect(resolveEffectivePosLogoUrl(businessOnly)).toBe("logo-a.png");
    expect(resolveEffectivePosLogoUrl({})).toBe("");
  });

  it("legacy POS merge does not wipe a stored POS path", () => {
    expect(resolveEffectivePosLogoUrl({ logo_url: "logo-a.png", pos_logo_url: "" })).toBe("logo-a.png");
    expect(mergePosLogo("logo-b.png", { pos_logo_url: "" })).toBe("logo-b.png");
  });
});
