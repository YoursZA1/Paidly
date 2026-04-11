import { describe, it, expect } from "vitest";
import { subscriptionRowToProfilePatch } from "@/lib/subscriptionRowToProfilePatch";

const TS = "2026-04-11T12:00:00.000Z";

describe("subscriptionRowToProfilePatch", () => {
  it("returns null without user_id or empty plan fields", () => {
    expect(subscriptionRowToProfilePatch(null, TS)).toBeNull();
    expect(subscriptionRowToProfilePatch({}, TS)).toBeNull();
    expect(subscriptionRowToProfilePatch({ user_id: "u1" }, TS)).toBeNull();
    expect(subscriptionRowToProfilePatch({ user_id: "u1", plan: "", current_plan: "" }, TS)).toBeNull();
    expect(subscriptionRowToProfilePatch({ user_id: "", plan: "sme" }, TS)).toBeNull();
  });

  it("normalizes free to individual tier for profile sync", () => {
    const out = subscriptionRowToProfilePatch({ user_id: "u1", plan: "free", status: "active" }, TS);
    expect(out.patch.plan).toBe("individual");
    expect(out.patch.subscription_status).toBe("active");
  });

  it("maps enterprise-style slug to corporate", () => {
    const out = subscriptionRowToProfilePatch({ user_id: "u1", plan: "enterprise", status: "active" }, TS);
    expect(out.patch.plan).toBe("corporate");
  });

  it("throws if updatedAtIso is missing or empty", () => {
    expect(() => subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme" })).toThrow(TypeError);
    expect(() => subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme" }, "")).toThrow(TypeError);
    expect(() => subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme" }, "   ")).toThrow(TypeError);
  });

  it("maps active subscription to active profile + clears trial + is_pro", () => {
    const out = subscriptionRowToProfilePatch(
      { user_id: "abc-uuid", plan: "sme", status: "active" },
      TS
    );
    expect(out).toEqual({
      userId: "abc-uuid",
      patch: {
        plan: "sme",
        subscription_plan: "sme",
        subscription_status: "active",
        updated_at: TS,
        trial_ends_at: null,
        is_pro: true,
      },
    });
  });

  it("uses current_plan when plan missing", () => {
    const out = subscriptionRowToProfilePatch(
      { user_id: "u1", current_plan: "corporate", status: "active" },
      TS
    );
    expect(out.patch.plan).toBe("corporate");
    expect(out.patch.subscription_plan).toBe("corporate");
  });

  it("defaults status to active when omitted", () => {
    const out = subscriptionRowToProfilePatch({ user_id: "u1", plan: "individual" }, TS);
    expect(out.patch.subscription_status).toBe("active");
    expect(out.patch.is_pro).toBe(true);
    expect(out.patch.trial_ends_at).toBeNull();
  });

  it("maps paused to inactive profile and is_pro false", () => {
    const out = subscriptionRowToProfilePatch(
      { user_id: "u1", plan: "individual", status: "paused" },
      TS
    );
    expect(out.patch.subscription_status).toBe("inactive");
    expect(out.patch.is_pro).toBe(false);
    expect(out.patch).not.toHaveProperty("trial_ends_at");
  });

  it("maps cancelled and expired", () => {
    expect(
      subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme", status: "cancelled" }, TS).patch
        .subscription_status
    ).toBe("cancelled");
    expect(
      subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme", status: "canceled" }, TS).patch
        .subscription_status
    ).toBe("cancelled");
    expect(
      subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme", status: "expired" }, TS).patch
        .subscription_status
    ).toBe("expired");
    expect(
      subscriptionRowToProfilePatch({ user_id: "u1", plan: "sme", status: "past_due" }, TS).patch
        .subscription_status
    ).toBe("past_due");
  });

  it("normalizes plan casing", () => {
    const out = subscriptionRowToProfilePatch({ user_id: "u1", plan: "SME" }, TS);
    expect(out.patch.plan).toBe("sme");
  });

  it("stringifies user id (e.g. uuid object edge)", () => {
    const out = subscriptionRowToProfilePatch({ user_id: 123, plan: "individual" }, TS);
    expect(out.userId).toBe("123");
  });
});
