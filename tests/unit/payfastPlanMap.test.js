import { describe, expect, it } from "vitest";
import { mapPayfastPlanToProfilePlan } from "../../server/src/payfastSubscriptionItn.js";

describe("mapPayfastPlanToProfilePlan", () => {
  it("maps current catalog item names to current families", () => {
    expect(mapPayfastPlanToProfilePlan("Paidly Starter")).toBe("starter");
    expect(mapPayfastPlanToProfilePlan("Paidly Business")).toBe("business");
    expect(mapPayfastPlanToProfilePlan("Paidly Growth")).toBe("growth");
    expect(mapPayfastPlanToProfilePlan("Paidly Enterprise")).toBe("enterprise");
  });

  it("keeps historical PayFast item names for existing renewals", () => {
    expect(mapPayfastPlanToProfilePlan("Individual")).toBe("individual");
    expect(mapPayfastPlanToProfilePlan("SME")).toBe("sme");
    expect(mapPayfastPlanToProfilePlan("Corporate")).toBe("corporate");
  });

  it("does not default unknown names to individual", () => {
    expect(mapPayfastPlanToProfilePlan("")).toBe("");
    expect(mapPayfastPlanToProfilePlan("unknown-product")).toBe("");
  });
});
