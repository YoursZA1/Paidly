import { describe, expect, it } from "vitest";
import { decimalInputValue, formatDecimalNumber, parseDecimalInput } from "@/utils/decimalInput";

describe("parseDecimalInput", () => {
  it("reads a comma as the decimal mark", () => {
    expect(parseDecimalInput("0,01")).toBe(0.01);
    expect(parseDecimalInput("3 700,50")).toBe(3700.5);
    expect(parseDecimalInput("1.700,50")).toBe(1700.5);
  });

  it("still reads a dot decimal", () => {
    expect(parseDecimalInput("0.01")).toBe(0.01);
    expect(parseDecimalInput("1,700.50")).toBe(1700.5);
  });

  it("waits while the decimal mark is still being typed", () => {
    expect(parseDecimalInput("0,")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });
});

describe("formatDecimalNumber", () => {
  it("shows cents with a comma", () => {
    expect(formatDecimalNumber(0.01)).toBe("0,01");
    expect(formatDecimalNumber("3700.5")).toBe("3700,5");
    expect(decimalInputValue("0,01")).toBe("0.01");
  });
});
