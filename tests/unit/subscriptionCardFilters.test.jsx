/** @vitest-environment jsdom */
/**
 * Admin → Subscriptions: summary cards act as filters for the table.
 * The cards and the table use one definition per status (shared/subscriptionOverviewBuckets.js),
 * so a card's server count and the rows it filters to mean the same thing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import SubscriptionOverview from "../../src/components/dashboard/SubscriptionOverview.jsx";
import {
  SUBSCRIPTION_STATUS_FILTER,
  subscriptionMatchesStatusFilter,
} from "../../shared/subscriptionOverviewBuckets.js";

const DAY = 86_400_000;
const iso = (off) => new Date(Date.now() + off).toISOString();

const ROWS = [
  { id: "a1", status: "active", plan: "growth", user_name: "Armando", subscription_source: "payfast" },
  { id: "a2", status: "active", plan: "starter", user_name: "Bea", subscription_source: "admin" },
  { id: "p1", status: "pending", plan: "business", user_name: "Cee" },
  { id: "p2", status: "processing", plan: "business", user_name: "Dee" },
  { id: "e1", status: "expired", plan: "starter", user_name: "Eve" },
  { id: "c1", status: "cancelled", plan: "growth", user_name: "Fay" },
  { id: "c2", status: "canceled", plan: "growth", user_name: "Gus" },
  { id: "t1", status: "trialing", plan: "growth", trial_ends_at: iso(3 * DAY), user_name: "Hal" },
  { id: "t2", status: "trial", plan: "starter", trial_ends_at: iso(2 * DAY), user_name: "Ivy" },
  { id: "t3", status: "trialing", plan: "business", trial_ends_at: iso(-DAY), admin_override: false, user_name: "Jo" },
  { id: "t4", status: "trialing", plan: "business", trial_ends_at: iso(-DAY), admin_override: true, user_name: "Kim" },
  { id: "d1", status: "past_due", plan: "growth", user_name: "Lee" },
  { id: "f1", status: "failed", plan: "starter", user_name: "Mo" },
  { id: "s1", status: "suspended", plan: "growth", user_name: "Nia" },
  { id: "n1", status: "none", plan: null, user_name: "Armando Jr", _isSynthetic: true },
];

const idsFor = (filter) =>
  ROWS.filter((r) => subscriptionMatchesStatusFilter(r, filter)).map((r) => r.id);

describe("status filter definitions match the summary cards", () => {
  it("Active / Active Subscribers", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.ACTIVE)).toEqual(["a1", "a2"]);
  });

  it("Pending counts processing too (same set the server counts)", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.PENDING)).toEqual(["p1", "p2"]);
  });

  it("Cancelled covers both spellings", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.CANCELLED)).toEqual(["c1", "c2"]);
  });

  it("Trial covers trialing and trial, regardless of trial end date", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.TRIAL)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("Trial Users is only trials still running (same as the server's count query)", () => {
    // t3/t4 are past trial_ends_at, so the server's trialUsers count excludes them as well.
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.LIVE_TRIAL)).toEqual(["t1", "t2"]);
  });

  it("Expired Trials is expired rows plus lapsed trials, excluding admin-managed ones", () => {
    // t3 lapsed; t4 lapsed but admin-managed (server excludes it); e1 expired subscription.
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.EXPIRED_TRIALS)).toEqual(["e1", "t3"]);
  });

  it("Expired (subscription) is not the same set as Expired Trials", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.EXPIRED)).toEqual(["e1"]);
  });

  it("Past Due, Failed, Suspended, no-subscription rows", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.PAST_DUE)).toEqual(["d1"]);
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.FAILED)).toEqual(["f1"]);
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.SUSPENDED)).toEqual(["s1"]);
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.NONE)).toEqual(["n1"]);
  });

  it("Admin granted is active + admin source", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.ADMIN_GRANTED)).toEqual(["a2"]);
  });

  it("All returns everything", () => {
    expect(idsFor(SUBSCRIPTION_STATUS_FILTER.ALL)).toHaveLength(ROWS.length);
  });
});

describe("status filter combines with plan and search (AND, never OR)", () => {
  const filterRows = ({ status = "all", plan = "all", search = "" }) =>
    ROWS.filter((r) => {
      const matchSearch = !search || (r.user_name || "").toLowerCase().includes(search.toLowerCase());
      const matchPlan = plan === "all" || r.plan === plan;
      return matchSearch && matchPlan && subscriptionMatchesStatusFilter(r, status);
    }).map((r) => r.id);

  it("Active + Growth", () => {
    expect(filterRows({ status: "active", plan: "growth" })).toEqual(["a1"]);
  });

  it("Active + search", () => {
    expect(filterRows({ status: "active", search: "armando" })).toEqual(["a1"]);
    // the synthetic "Armando Jr" row matches the search but is not active
    expect(filterRows({ status: "all", search: "armando" })).toEqual(["a1", "n1"]);
  });

  it("Active + Growth + search", () => {
    expect(filterRows({ status: "active", plan: "growth", search: "armando" })).toEqual(["a1"]);
    expect(filterRows({ status: "active", plan: "starter", search: "armando" })).toEqual([]);
  });
});

const overview = {
  total: 60,
  buckets: [
    { key: "active", label: "Active", count: 28 },
    { key: "pending", label: "Pending", count: 3 },
    { key: "expired", label: "Expired", count: 5 },
    { key: "cancelled", label: "Cancelled", count: 23 },
    { key: "trial", label: "Trial", count: 7 },
    { key: "pastDue", label: "Past Due", count: 1 },
  ],
};
const reporting = { successfulPayments: 12, revenue: 4200, activeSubscribers: 28, trialUsers: 7, expiredTrials: 5 };

/** Mirrors how SubscriptionsPage owns the one filter state shared by the cards and the dropdown. */
function Harness({ onChange }) {
  const [statusFilter, setStatusFilter] = useState(SUBSCRIPTION_STATUS_FILTER.ALL);
  const set = (v) => {
    setStatusFilter(v);
    onChange?.(v);
  };
  return (
    <MemoryRouter>
      <SubscriptionOverview
        overview={overview}
        reporting={reporting}
        statusFilter={statusFilter}
        onSelectFilter={set}
      />
      <select
        data-testid="status-dropdown"
        value={statusFilter}
        onChange={(e) => set(e.target.value)}
      >
        {["all", "active", "pending", "cancelled", "trialing", "live_trial", "expired_trials", "past_due"].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </MemoryRouter>
  );
}

let container;
let root;

const mount = (ui) => {
  act(() => {
    root.render(ui);
  });
};
const cards = () => [...container.querySelectorAll("button[aria-pressed]")];
/** Cards are found by their visible title, which does not change when the card becomes applied. */
const card = (title) => {
  const match = cards().find(
    (el) => (el.querySelector("p")?.textContent || "").trim().toLowerCase() === title.toLowerCase()
  );
  if (!match) {
    const seen = cards().map((c) => c.querySelector("p")?.textContent).join(" | ");
    throw new Error(`No card titled "${title}". Found: ${seen}`);
  }
  return match;
};
const dropdown = () => container.querySelector('[data-testid="status-dropdown"]');
const click = (el) => {
  act(() => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
const selectStatus = (value) => {
  const el = dropdown();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("cards drive the shared filter state", () => {
  it.each([
    ["Active Subscribers", "active"],
    ["Trial Users", "live_trial"],
    ["Expired Trials", "expired_trials"],
    ["Pending", "pending"],
    ["Cancelled", "cancelled"],
    ["Past Due", "past_due"],
  ])("clicking %s sets the filter to %s and syncs the dropdown", (label, expected) => {
    const onChange = vi.fn();
    mount(<Harness onChange={onChange} />);
    click(card(label));
    expect(onChange).toHaveBeenCalledWith(expected);
    expect(dropdown().value).toBe(expected);
  });

  it("clicking the applied card again clears back to All Status", () => {
    mount(<Harness />);
    click(card("Active Subscribers"));
    expect(dropdown().value).toBe("active");
    click(card("Active Subscribers"));
    expect(dropdown().value).toBe("all");
  });

  it("changing the dropdown marks the matching card and unmarks the previous one", () => {
    mount(<Harness />);
    click(card("Active Subscribers"));
    expect(card("Active Subscribers").getAttribute("aria-pressed")).toBe("true");

    selectStatus("cancelled");
    expect(card("Cancelled").getAttribute("aria-pressed")).toBe("true");
    expect(card("Active Subscribers").getAttribute("aria-pressed")).toBe("false");

    selectStatus("all");
    expect(cards().filter((c) => c.getAttribute("aria-pressed") === "true")).toHaveLength(0);
  });

  it("card values stay the global server counts while filtered", () => {
    mount(<Harness />);
    expect(card("Active Subscribers").textContent).toContain("28");
    click(card("Active Subscribers"));
    expect(card("Active Subscribers").textContent).toContain("28");
    expect(card("Cancelled").textContent).toContain("23");
  });

  it("applied card is marked, and cards are real buttons (keyboard operable, focusable)", () => {
    mount(<Harness />);
    const pending = card("Pending");
    expect(pending.tagName).toBe("BUTTON");
    expect(pending.getAttribute("type")).toBe("button");
    pending.focus();
    expect(document.activeElement).toBe(pending);
    click(pending);
    expect(dropdown().value).toBe("pending");
    expect(card("Pending").textContent).toContain("Currently filtered");
  });

  it("revenue and payment cards are not filters", () => {
    mount(<Harness />);
    const labels = cards().map((c) => (c.getAttribute("aria-label") || "").toLowerCase());
    expect(labels.some((l) => l.includes("revenue"))).toBe(false);
    expect(labels.some((l) => l.includes("successful payments"))).toBe(false);
  });

  it("without onSelectFilter the cards stay static (dashboard usage)", () => {
    mount(
      <MemoryRouter>
        <SubscriptionOverview overview={overview} reporting={reporting} />
      </MemoryRouter>
    );
    expect(cards()).toHaveLength(0);
  });
});
