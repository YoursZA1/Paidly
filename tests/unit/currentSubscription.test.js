import { describe, expect, it } from "vitest";
import {
  findReusableCheckoutRow,
  groupSubscriptionsByOwner,
  partitionCurrentSubscriptions,
  pickCurrentSubscriptionRow,
} from "../../shared/currentSubscription.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");

function row(partial) {
  return {
    company_id: "company-1",
    user_id: "user-1",
    updated_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("pickCurrentSubscriptionRow", () => {
  it("keeps the trialing row current and leaves cancelled rows as history", () => {
    const rows = [
      row({ id: "1", status: "cancelled", plan: "growth", updated_at: "2026-09-01T00:00:00.000Z" }),
      row({ id: "2", status: "cancelled", plan: "growth", updated_at: "2026-09-10T00:00:00.000Z" }),
      row({ id: "3", status: "cancelled", plan: "business", updated_at: "2026-09-15T00:00:00.000Z" }),
      row({ id: "4", status: "trialing", plan: "growth", updated_at: "2026-10-01T00:00:00.000Z" }),
      row({ id: "5", status: "cancelled", plan: "growth", updated_at: "2026-09-20T00:00:00.000Z" }),
      row({ id: "6", status: "cancelled", plan: "business", updated_at: "2026-09-05T00:00:00.000Z" }),
      row({ id: "7", status: "pending", plan: "growth", updated_at: "2026-10-02T00:00:00.000Z" }),
    ];
    const picked = pickCurrentSubscriptionRow(rows, NOW);
    expect(picked.id).toBe("4");
    const part = partitionCurrentSubscriptions(rows, NOW);
    expect(part.current).toHaveLength(1);
    expect(part.current[0].id).toBe("4");
    expect(part.current[0].history_count).toBe(6);
    expect(part.duplicateCurrent).toBe(0);
    expect(part.multipleHistorical).toBe(1);
  });

  it("prefers active over a newer trial", () => {
    const picked = pickCurrentSubscriptionRow(
      [
        row({ id: "trial", status: "trialing", updated_at: "2026-10-08T00:00:00.000Z" }),
        row({ id: "paid", status: "active", updated_at: "2026-10-01T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(picked.id).toBe("paid");
  });

  it("does not merge two companies that share a user", () => {
    const groups = groupSubscriptionsByOwner([
      row({ id: "a", company_id: "co-a", status: "active" }),
      row({ id: "b", company_id: "co-b", status: "trialing" }),
    ]);
    expect(groups).toHaveLength(2);
    const part = partitionCurrentSubscriptions(
      [
        row({ id: "a", company_id: "co-a", status: "active" }),
        row({ id: "b", company_id: "co-b", status: "trialing" }),
      ],
      NOW
    );
    expect(part.current).toHaveLength(2);
  });

  it("folds company-less rows into the user's only company", () => {
    const part = partitionCurrentSubscriptions(
      [
        row({ id: "live", company_id: "co-a", status: "trialing", updated_at: "2026-10-01T00:00:00.000Z" }),
        row({ id: "old", company_id: null, status: "cancelled", updated_at: "2026-09-01T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(part.current).toHaveLength(1);
    expect(part.current[0].id).toBe("live");
    expect(part.current[0].history_count).toBe(1);
  });

  it("counts two flagged current rows as a data-health problem", () => {
    const part = partitionCurrentSubscriptions(
      [
        row({ id: "a", status: "active", is_current: true }),
        row({ id: "b", status: "cancelled", is_current: true }),
      ],
      NOW
    );
    expect(part.duplicateCurrent).toBe(1);
    expect(part.current[0].id).toBe("a");
  });

  it("counts a row with no owner as invalid", () => {
    const part = partitionCurrentSubscriptions(
      [row({ id: "x", company_id: null, user_id: null, status: "cancelled" })],
      NOW
    );
    expect(part.invalid).toBe(1);
    expect(part.current).toHaveLength(0);
  });
});

describe("findReusableCheckoutRow", () => {
  it("updates the pending checkout instead of inserting another", () => {
    const decision = findReusableCheckoutRow(
      [
        row({ id: "trial", status: "trialing" }),
        row({ id: "pending", status: "pending", updated_at: "2026-10-02T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(decision.mode).toBe("pending");
    expect(decision.row.id).toBe("pending");
  });

  it("reuses a cancelled shell and leaves the live trial alone", () => {
    const decision = findReusableCheckoutRow(
      [
        row({ id: "trial", status: "trialing", updated_at: "2026-10-01T00:00:00.000Z" }),
        row({ id: "shell", status: "cancelled", payfast_token: null, updated_at: "2026-09-02T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(decision.mode).toBe("shell");
    expect(decision.row.id).toBe("shell");
  });

  it("does not reuse a cancelled PayFast agreement as a checkout shell", () => {
    const decision = findReusableCheckoutRow(
      [
        row({ id: "trial", status: "trialing" }),
        row({ id: "paid", status: "cancelled", payfast_token: "tok_123" }),
      ],
      NOW
    );
    expect(decision.mode).toBe("insert");
  });

  it("turns the only lapsed row into the checkout instead of inserting", () => {
    const decision = findReusableCheckoutRow(
      [row({ id: "old", status: "expired", payfast_token: null })],
      NOW
    );
    expect(decision.mode).toBe("replace");
    expect(decision.row.id).toBe("old");
  });
});
