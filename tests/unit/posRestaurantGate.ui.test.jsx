/** @vitest-environment jsdom */
/**
 * The till's restaurant layer follows the business type: retail and mixed tills never request the
 * floor plan or show dine-in / takeaway / kitchen — even when tables exist. Restaurants get it all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const calls = vi.hoisted(() => ({ floor: 0 }));
vi.mock("@/services/PosRestaurantService", () => ({
  fetchRestaurantFloor: async () => {
    calls.floor += 1;
    return { floors: [{ id: "f1", name: "Main" }], tables: [{ id: "t1", floor_id: "f1", name: "1" }], takeaway: [] };
  },
  fetchTab: async () => null,
  tabAction: async () => null,
}));
vi.mock("@/services/PosIntegrationService", () => ({ fetchPosPaymentIntent: async () => null }));

const { usePosRestaurant } = await import("@/components/pos/restaurant/usePosRestaurant");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
let seen;
function Probe({ businessType }) {
  const r = usePosRestaurant({
    businessType,
    registerId: null,
    cashierName: "",
    cart: [],
    setCart: () => {},
    toast: () => {},
    searchParams: new URLSearchParams(),
    setSearchParams: () => {},
  });
  seen = r;
  return null;
}
beforeEach(() => {
  calls.floor = 0;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

async function mount(businessType) {
  await act(async () => root.render(<Probe businessType={businessType} />));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

describe("restaurant features follow the business type", () => {
  it.each(["retail", "mixed", "service", null])("%s: off, and no floor request", async (type) => {
    await mount(type);
    expect(seen.enabled).toBe(false);
    expect(seen.orderType).toBe("counter");
    expect(calls.floor).toBe(0);
  });

  it("restaurant: on, dine-in first", async () => {
    await mount("restaurant");
    expect(seen.enabled).toBe(true);
    expect(seen.orderType).toBe("dine_in");
    expect(calls.floor).toBe(1);
  });
});
