/** @vitest-environment jsdom */
/**
 * Billing & Invoices → Subscription history.
 * - fetchMySubscriptions: queries only the auth user's rows and never turns a DB error into [].
 * - Page: loading → skeleton, error → code + message + retry, success/0 rows → empty state,
 *   success/rows → table. "No subscription records yet" only after a successful query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ session: null, authReady: false }) }));

const hookState = { current: null };
vi.mock("@/hooks/useMySubscriptionsQuery", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useMySubscriptionsQuery: () => hookState.current };
});
vi.mock("@/hooks/useEntitlementAccess", () => ({
  useEntitlementAccess: () => ({ entitlement: {}, accessGranted: false, isEntitlementReady: true }),
}));

const { fetchMySubscriptions, SubscriptionHistoryError } = await import("@/hooks/useMySubscriptionsQuery");
const { default: BillingAndInvoices } = await import("@/pages/BillingAndInvoices");

const USER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";

function fakeClient(result) {
  const calls = [];
  const builder = {
    select: (cols) => (calls.push(["select", cols]), builder),
    eq: (col, val) => (calls.push(["eq", col, val]), builder),
    order: (col, opts) => (calls.push(["order", col, opts]), Promise.resolve(result)),
  };
  return { calls, from: (table) => (calls.push(["from", table]), builder) };
}

describe("fetchMySubscriptions", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("filters public.subscriptions by the auth user id", async () => {
    const client = fakeClient({ data: [{ id: "s1", user_id: USER }], error: null });
    await expect(fetchMySubscriptions(client, USER)).resolves.toEqual([{ id: "s1", user_id: USER }]);
    expect(client.calls).toContainEqual(["from", "subscriptions"]);
    expect(client.calls).toContainEqual(["eq", "user_id", USER]);
  });

  it("returns [] for a successful query with no rows", async () => {
    await expect(fetchMySubscriptions(fakeClient({ data: [], error: null }), USER)).resolves.toEqual([]);
  });

  it("throws the Postgres error (code/message/hint) instead of returning an empty history", async () => {
    const pgError = {
      code: "42501",
      message: "permission denied for function is_billing_admin",
      details: null,
      hint: null,
    };
    const err = await fetchMySubscriptions(fakeClient({ data: null, error: pgError }), USER).catch((e) => e);
    expect(err).toBeInstanceOf(SubscriptionHistoryError);
    expect(err).toMatchObject({ code: "42501", message: pgError.message });
    expect(console.error).toHaveBeenCalled();
  });

  it("refuses rows that belong to another user", async () => {
    const client = fakeClient({ data: [{ id: "s1", user_id: USER }, { id: "s2", user_id: OTHER }], error: null });
    await expect(fetchMySubscriptions(client, USER)).rejects.toMatchObject({ code: "FOREIGN_ROWS" });
  });

  it("does not query without an auth user id", async () => {
    const client = fakeClient({ data: [], error: null });
    await expect(fetchMySubscriptions(client, null)).rejects.toMatchObject({ code: "NOT_AUTHENTICATED" });
    expect(client.calls).toEqual([]);
  });
});

describe("Billing & Invoices subscription history states", () => {
  let container;
  let root;

  const base = {
    data: undefined,
    error: null,
    isError: false,
    isSuccess: false,
    isFetching: false,
    isAwaitingAuth: false,
    isSignedOut: false,
    refetch: vi.fn(),
  };

  async function render(state) {
    hookState.current = { ...base, ...state };
    await act(async () => {
      root.render(
        <MemoryRouter>
          <BillingAndInvoices />
        </MemoryRouter>
      );
    });
    return container.textContent;
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows a skeleton while auth is still loading (not the empty state)", async () => {
    const text = await render({ isAwaitingAuth: true });
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/No subscription records yet/);
    expect(text).not.toMatch(/Could not load/);
  });

  it("shows a skeleton while the query is pending", async () => {
    const text = await render({});
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/No subscription records yet/);
  });

  it("shows the real error with its code and a retry, never the empty state", async () => {
    const error = new SubscriptionHistoryError({ code: "42501", message: "permission denied for function is_billing_admin" });
    const refetch = vi.fn();
    const text = await render({ isError: true, error, refetch });
    expect(text).toMatch(/Could not load subscription history/);
    expect(text).toMatch(/42501/);
    expect(text).toMatch(/permission denied for function is_billing_admin/);
    expect(text).not.toMatch(/No subscription records yet/);
    const retry = [...container.querySelectorAll("button")].find((b) => /Try again/.test(b.textContent));
    await act(async () => retry.click());
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state only for a successful query with zero rows", async () => {
    const text = await render({ isSuccess: true, data: [] });
    expect(text).toMatch(/No subscription records yet/);
    expect(container.querySelectorAll(".skeleton-shimmer")).toHaveLength(0);
  });

  it("renders the history table for a successful query with rows", async () => {
    const text = await render({
      isSuccess: true,
      data: [
        { id: "s1", user_id: USER, plan: "growth", status: "active", amount: 350 },
        { id: "s2", user_id: USER, plan: "starter", status: "expired", amount: 50 },
      ],
    });
    expect(container.querySelector('table[aria-label="Your Paidly subscription agreements"]')).not.toBeNull();
    expect(text).toMatch(/active/i);
    expect(text).toMatch(/expired/i);
    expect(text).not.toMatch(/No subscription records yet/);
  });

  it("asks a signed-out visitor to sign in instead of showing an empty history", async () => {
    const text = await render({ isSignedOut: true });
    expect(text).toMatch(/Sign in to see your subscription history/);
    expect(text).not.toMatch(/No subscription records yet/);
  });
});
