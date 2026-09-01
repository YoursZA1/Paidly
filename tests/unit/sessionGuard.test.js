import { describe, expect, it } from "vitest";
import { isPathAllowedWithoutSession } from "@/utils/sessionGuard";

describe("isPathAllowedWithoutSession", () => {
  it("lets guests stay on POS sign-in and till URLs", () => {
    expect(isPathAllowedWithoutSession("/pos")).toBe(true);
    expect(isPathAllowedWithoutSession("/pos/")).toBe(true);
    expect(isPathAllowedWithoutSession("/pos/till/11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPathAllowedWithoutSession("/pos/join")).toBe(true);
    expect(isPathAllowedWithoutSession("/pos/invite/abc")).toBe(true);
  });

  it("still treats back-office routes as session-required", () => {
    expect(isPathAllowedWithoutSession("/Dashboard")).toBe(false);
    expect(isPathAllowedWithoutSession("/Invoices")).toBe(false);
  });
});
