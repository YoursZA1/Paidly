import { describe, expect, it } from "vitest";
import {
  animationStartFrom,
  countPriceFrame,
  easeOutCubic,
  interpolateEaseOut,
  marketingZarNumericPart,
} from "../../src/lib/animatedPrice.js";

describe("pricing count animation", () => {
  it("eases out from 0 to 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("counts down through whole rands from 50 to 40", () => {
    expect(countPriceFrame(50, 40, 0)).toBe(50);
    expect(countPriceFrame(50, 40, 1)).toBe(40);
    const frames = Array.from({ length: 11 }, (_, i) => countPriceFrame(50, 40, i / 10));
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]).toBeLessThanOrEqual(frames[i - 1]);
    }
    expect(frames).toContain(50);
    expect(frames[frames.length - 1]).toBe(40);
  });

  it("counts up through whole rands from 40 to 50", () => {
    expect(countPriceFrame(40, 50, 0)).toBe(40);
    expect(countPriceFrame(40, 50, 1)).toBe(50);
    const frames = Array.from({ length: 11 }, (_, i) => countPriceFrame(40, 50, i / 10));
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
    }
    expect(frames[0]).toBe(40);
    expect(frames[frames.length - 1]).toBe(50);
  });

  it("keeps existing ZAR grouping on the numeric portion only", () => {
    expect(marketingZarNumericPart(50)).toBe("50");
    expect(marketingZarNumericPart(1500, { grouped: true })).toBe("1,500");
    expect(interpolateEaseOut(50, 500, 0)).toBe(50);
    expect(interpolateEaseOut(50, 500, 1)).toBe(500);
  });

  it("snaps to the target when the first valid amount arrives instead of counting from 0", () => {
    expect(animationStartFrom(0, 50, { hadValidDisplay: false })).toBe(50);
    expect(animationStartFrom(0, 50, { hadValidDisplay: true })).toBe(0);
    expect(animationStartFrom(50, 40, { hadValidDisplay: true })).toBe(50);
    expect(animationStartFrom(NaN, 150, { hadValidDisplay: true })).toBe(150);
  });
});
