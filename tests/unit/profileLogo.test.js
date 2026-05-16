import { describe, expect, it } from "vitest";
import {
  mergeProfileLogo,
  resolveProfileLogoUrl,
  syncProfileLogoAliases,
} from "@/lib/profileLogo";

describe("profileLogo", () => {
  it("resolveProfileLogoUrl prefers logo_url", () => {
    expect(resolveProfileLogoUrl({ logo_url: "logo-a.png", company_logo_url: "b.png" })).toBe(
      "logo-a.png"
    );
  });

  it("mergeProfileLogo keeps previous when incoming is empty", () => {
    expect(mergeProfileLogo("stored.png", { logo_url: "" })).toBe("stored.png");
    expect(mergeProfileLogo("stored.png", { logo_url: null })).toBe("stored.png");
  });

  it("syncProfileLogoAliases mirrors company_logo_url", () => {
    expect(syncProfileLogoAliases({ logo_url: "x.svg" })).toEqual({
      logo_url: "x.svg",
      company_logo_url: "x.svg",
    });
  });
});
