import { describe, expect, it } from "vitest";
import { asWholeDays } from "@/utils/wholeDays.js";

describe("asWholeDays", () => {
  it("keeps whole day counts and rejects decimals instead of writing 1.25 to integer", () => {
    expect(asWholeDays(30)).toBe(30);
    expect(asWholeDays("7")).toBe(7);
    expect(asWholeDays("1.25")).toBe(1);
    expect(asWholeDays("")).toBeNull();
    expect(asWholeDays(null)).toBeNull();
    expect(asWholeDays(-3)).toBeNull();
  });
});
