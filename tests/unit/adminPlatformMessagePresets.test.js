import { describe, expect, it } from "vitest";
import {
  buildAdminPlatformMessagePresets,
  DEFAULT_ADMIN_PLATFORM_SUBJECT,
} from "../../src/lib/adminPlatformMessagePresets.js";

describe("buildAdminPlatformMessagePresets", () => {
  it("uses origin for login links", () => {
    const presets = buildAdminPlatformMessagePresets("https://app.example.com");
    const waitlist = presets.find((p) => p.id === "waitlist_activate");
    expect(waitlist).toBeDefined();
    expect(waitlist.body).toContain("https://app.example.com/Login");
  });

  it("includes waitlist, confirm email, and update starters", () => {
    const ids = buildAdminPlatformMessagePresets().map((p) => p.id);
    expect(ids).toContain("waitlist_activate");
    expect(ids).toContain("email_confirm");
    expect(ids).toContain("product_update");
  });
});

describe("DEFAULT_ADMIN_PLATFORM_SUBJECT", () => {
  it("matches server default subject line", () => {
    expect(DEFAULT_ADMIN_PLATFORM_SUBJECT).toBe("Message from the Paidly team");
  });
});
