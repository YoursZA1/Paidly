/** URL head (`/api/pos/<head>`) → restaurant route name. Dependency-free (used by posVercelRoute). */
export const RESTAURANT_ROUTE_BY_HEAD = Object.freeze({
  floor: "restaurant-floor",
  "floor-setup": "restaurant-floor-setup",
  tab: "restaurant-tab",
  "tab-pay": "restaurant-tab-pay",
  kitchen: "restaurant-kitchen",
  orders: "restaurant-orders",
  // Not restaurant-specific, but shares the same single-segment dispatch table.
  providers: "pos-providers",
});
