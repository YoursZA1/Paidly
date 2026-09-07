import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKETING_PLAN_ORDER,
  MARKETING_PLANS,
  MARKETING_TRIAL_FOOTER,
  marketingPlanSelectLabel,
} from "../../shared/planMarketing.js";
import { PLANS } from "../../shared/plans.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("public pricing catalog", () => {
  it("monthly amounts match shared PLANS fallback", () => {
    expect(MARKETING_PLANS.starter.monthlyPriceZar).toBe(PLANS.starter_monthly.price);
    expect(MARKETING_PLANS.business.monthlyPriceZar).toBe(PLANS.business_monthly.price);
    expect(MARKETING_PLANS.growth.monthlyPriceZar).toBe(PLANS.growth_monthly.price);
    expect(MARKETING_PLANS.starter.annualPriceZar).toBe(PLANS.starter_annual.price);
    expect(MARKETING_PLANS.business.annualPriceZar).toBe(PLANS.business_annual.price);
    expect(MARKETING_PLANS.growth.annualPriceZar).toBe(PLANS.growth_annual.price);
  });

  it("annual billing is two months free (10× monthly)", () => {
    for (const family of ["starter", "business", "growth"]) {
      const plan = MARKETING_PLANS[family];
      expect(plan.annualPriceZar).toBe(plan.monthlyPriceZar * 10);
    }
  });

  it("signup labels use current names and ZAR prices", () => {
    expect(marketingPlanSelectLabel("starter")).toBe("Starter — R50/mo");
    expect(marketingPlanSelectLabel("business")).toBe("Business — R150/mo");
    expect(marketingPlanSelectLabel("growth")).toBe("Growth — R350/mo");
    expect(marketingPlanSelectLabel("enterprise")).toBe("Enterprise — Custom");
  });

  it("keeps the free-trial footer", () => {
    expect(MARKETING_TRIAL_FOOTER).toMatch(/free trial/i);
    expect(MARKETING_TRIAL_FOOTER).toMatch(/no credit card/i);
  });

  it("admin plan defaults match public catalog prices", async () => {
    const { DEFAULT_PLANS, PLAN_ORDER } = await import("../../src/data/planDefaults.js");
    expect(PLAN_ORDER).toEqual(["starter", "business", "growth", "enterprise"]);
    expect(DEFAULT_PLANS.starter.priceMonthly).toBe(50);
    expect(DEFAULT_PLANS.business.priceMonthly).toBe(150);
    expect(DEFAULT_PLANS.growth.priceMonthly).toBe(350);
    expect(DEFAULT_PLANS.enterprise.priceMonthly).toBe(0);
    expect(DEFAULT_PLANS).not.toHaveProperty("professional");
    expect(DEFAULT_PLANS.business.recommended).toBe(true);
    expect(DEFAULT_PLANS.starter.userLimit).toBe(1);
    expect(DEFAULT_PLANS.business.userLimit).toBe(5);
    expect(DEFAULT_PLANS.growth.userLimit).toBeNull();
  });

  it("index.html JSON-LD offers match the public catalog", () => {
    const html = readFileSync(path.join(root, "index.html"), "utf8");
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    const graph = JSON.parse(match[1]);
    const app = graph["@graph"].find((n) => Array.isArray(n["@type"]) && n["@type"].includes("WebApplication"));
    const offers = app.offers;
    expect(offers.map((o) => o.name)).toEqual(MARKETING_PLAN_ORDER.map((f) => MARKETING_PLANS[f].name));
    expect(offers.map((o) => o.price)).toEqual(["50", "150", "350", undefined]);
    expect(offers.map((o) => o.description)).toEqual(
      MARKETING_PLAN_ORDER.map((f) => MARKETING_PLANS[f].description)
    );
    expect(offers.every((o) => o.priceCurrency === "ZAR")).toBe(true);
  });
});
