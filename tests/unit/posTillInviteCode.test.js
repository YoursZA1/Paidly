import { describe, expect, it } from "vitest";
import {
  buildPosTillInviteMessage,
  formatPosTillInviteCode,
  isLegacyCompanyInviteToken,
  normalizePosTillInviteCode,
} from "../../shared/posTillInviteCode.js";
import {
  generatePosTillInviteCode,
  hashPosTillInviteCode,
} from "../../server/src/pos/posTillInviteCode.js";

describe("pos till invite codes", () => {
  it("normalizes case, spaces, and hyphens", () => {
    expect(normalizePosTillInviteCode(" 7k4m-x92q ")).toBe("7K4MX92Q");
    expect(formatPosTillInviteCode("7k4m x92q")).toBe("7K4M-X92Q");
  });

  it("generates unique 8-char codes that hash stably", () => {
    const a = generatePosTillInviteCode();
    const b = generatePosTillInviteCode();
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(a).not.toBe(b);
    expect(hashPosTillInviteCode(a)).toBe(hashPosTillInviteCode(a.toLowerCase()));
    expect(hashPosTillInviteCode(a)).toHaveLength(64);
    expect(hashPosTillInviteCode(a)).not.toBe(a);
  });

  it("does not treat a till code as a legacy hex token", () => {
    expect(isLegacyCompanyInviteToken("7K4M-X92Q")).toBe(false);
    expect(isLegacyCompanyInviteToken("a".repeat(64))).toBe(true);
  });

  it("builds a POS-only share message with code and link", () => {
    const text = buildPosTillInviteMessage({
      companyName: "Acme",
      tillName: "Main Till",
      inviteCode: "7k4m-x92q",
      inviteLink: "https://www.paidly.co.za/pos/invite/7K4M-X92Q",
    });
    expect(text).toContain("7K4M-X92Q");
    expect(text).toContain("Main Till");
    expect(text).toContain("POS-only");
    expect(text).not.toContain("dashboard access");
  });
});
