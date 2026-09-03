import { describe, expect, it } from "vitest";
import { resolveBusinessLogoUrl } from "@/lib/brandingLogos";

const businessA = { logo_url: "logo-a.png", company_logo_url: "ignored.png" };
const businessOnly = { logo_url: "logo-a.png" };

describe("brandingLogos", () => {
  it("uses official Business Logo from logo_url", () => {
    expect(resolveBusinessLogoUrl(businessA)).toBe("logo-a.png");
    expect(resolveBusinessLogoUrl(businessOnly)).toBe("logo-a.png");
    expect(resolveBusinessLogoUrl({})).toBe("");
  });

  it("treats an explicit empty logo_url as cleared", () => {
    expect(resolveBusinessLogoUrl({ logo_url: "", company_logo_url: "stale.png" })).toBe("");
  });
});
