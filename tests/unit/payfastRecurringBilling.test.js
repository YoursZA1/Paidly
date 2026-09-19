import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelPayfastRecurringBilling,
  fetchPayfastSubscription,
  generatePayfastApiSignature,
  payfastApiTimestamp,
  payfastUpdateCardUrl,
  randsToCents,
  updatePayfastSubscription,
} from "../../server/src/billing/payfastRecurringApi.js";
import {
  PLAN_CHANGE_DIRECTION,
  planChangeDirection,
  scheduledPlanChangeDue,
} from "@shared/subscriptionPlanChange.js";
import { SUBSCRIPTION_EVENT_TYPES } from "@shared/subscriptionEventTypes.js";

const md5 = (s) => createHash("md5").update(s).digest("hex");
const ENV_KEYS = ["PAYFAST_MODE", "PAYFAST_SANDBOX_MERCHANT_ID", "PAYFAST_SANDBOX_PASSPHRASE", "PAYFAST_PASSPHRASE"];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.PAYFAST_MODE = "sandbox";
  process.env.PAYFAST_SANDBOX_MERCHANT_ID = "10000100";
  process.env.PAYFAST_SANDBOX_PASSPHRASE = "jt7NOE43FZPn";
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function stubFetch(responseBody, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(responseBody) };
  };
  return { fetchImpl, calls };
}

describe("PayFast API signature (alphabetical, passphrase, no testing flag)", () => {
  it("sorts header + body keys, appends passphrase, excludes testing", () => {
    const sig = generatePayfastApiSignature(
      { version: "v1", "merchant-id": "10000100", timestamp: "2026-09-19T10:00:00+02:00", amount: 15000, testing: "true" },
      "jt7NOE43FZPn"
    );
    expect(sig).toBe(
      md5(
        "amount=15000&merchant-id=10000100&passphrase=jt7NOE43FZPn&timestamp=2026-09-19T10%3A00%3A00%2B02%3A00&version=v1"
      )
    );
  });

  it("formats ISO-8601 timestamps with an explicit offset", () => {
    expect(payfastApiTimestamp(new Date("2026-09-19T08:00:01Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
    );
  });

  it("converts rand amounts to integer cents", () => {
    expect(randsToCents(150)).toBe(15000);
    expect(randsToCents("350.5")).toBe(35050);
  });
});

describe("Subscriptions API calls", () => {
  it("PATCHes /update with cents in a signed JSON body and ?testing=true in sandbox", async () => {
    const { fetchImpl, calls } = stubFetch({ code: 200, status: "success", data: { response: { run_date: "2026-10-01" } } });
    const res = await updatePayfastSubscription("tok-1", { amount: 150, frequency: 3 }, { fetchImpl });
    expect(res.ok).toBe(true);
    const { url, init } = calls[0];
    expect(url).toBe("https://api.payfast.co.za/subscriptions/tok-1/update?testing=true");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ amount: 15000, frequency: 3 });
    expect(init.headers["merchant-id"]).toBe("10000100");
    expect(init.headers.version).toBe("v1");
    expect(init.headers.signature).toBe(
      generatePayfastApiSignature(
        { "merchant-id": "10000100", version: "v1", timestamp: init.headers.timestamp, amount: 15000, frequency: 3 },
        "jt7NOE43FZPn"
      )
    );
  });

  it("normalises GET /fetch", async () => {
    const { fetchImpl, calls } = stubFetch({
      code: 200,
      status: "success",
      data: { response: { amount: 35000, cycles: 0, cycles_complete: 4, frequency: 3, run_date: "2026-10-04T00:00:00+02:00", status: 1, status_text: "ACTIVE", token: "tok-1" } },
    });
    const res = await fetchPayfastSubscription("tok-1", { fetchImpl });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect(res.subscription).toMatchObject({ active: true, amount: 350, run_date: "2026-10-04", frequency: 3 });
  });

  it("treats data.response === false as a refusal", async () => {
    const { fetchImpl } = stubFetch({ code: 200, status: "success", data: { response: false, message: "The subscription is not in a valid state." } });
    const res = await cancelPayfastRecurringBilling("tok-1", { fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not in a valid state/);
  });

  it("builds the hosted card-update link on the right host", () => {
    expect(payfastUpdateCardUrl("tok-1", "https://www.paidly.co.za/settings", "live")).toBe(
      "https://www.payfast.co.za/eng/recurring/update/tok-1?return=https%3A%2F%2Fwww.paidly.co.za%2Fsettings"
    );
    expect(payfastUpdateCardUrl("tok-1", "", "sandbox")).toBe("https://sandbox.payfast.co.za/eng/recurring/update/tok-1");
    expect(payfastUpdateCardUrl("", "")).toBeNull();
  });
});

describe("plan change rules", () => {
  const starter = { slug: "starter_monthly", tier_rank: 1, amount: 50 };
  const business = { slug: "business_monthly", tier_rank: 2, amount: 150 };
  const growth = { slug: "growth_monthly", tier_rank: 3, amount: 350 };

  it("uses tier rank, then monthly-equivalent price", () => {
    expect(planChangeDirection(business, growth)).toBe(PLAN_CHANGE_DIRECTION.UPGRADE);
    expect(planChangeDirection(growth, starter)).toBe(PLAN_CHANGE_DIRECTION.DOWNGRADE);
    expect(planChangeDirection(growth, growth)).toBe(PLAN_CHANGE_DIRECTION.SAME);
    expect(
      planChangeDirection(
        { slug: "growth_monthly", amount: 350, billing_cycle: "monthly" },
        { slug: "growth_annual", amount: 3500, billing_cycle: "annual" }
      )
    ).toBe(PLAN_CHANGE_DIRECTION.DOWNGRADE);
  });

  it("applies a queued downgrade from its billing date (with a day of slack)", () => {
    const now = new Date("2026-10-01T06:00:00Z");
    expect(scheduledPlanChangeDue({ scheduled_plan_slug: "starter_monthly", scheduled_change_at: "2026-10-01T00:00:00+02:00" }, now)).toBe(true);
    expect(scheduledPlanChangeDue({ scheduled_plan_slug: "starter_monthly", scheduled_change_at: "2026-10-20T00:00:00+02:00" }, now)).toBe(false);
    expect(scheduledPlanChangeDue({ scheduled_plan_slug: null }, now)).toBe(false);
  });

  it("registers plan change event types", () => {
    expect(SUBSCRIPTION_EVENT_TYPES).toContain("plan_changed");
    expect(SUBSCRIPTION_EVENT_TYPES).toContain("plan_change_scheduled");
  });
});
