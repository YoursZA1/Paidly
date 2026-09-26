/**
 * One route table for restaurant POS, shared by the Vercel function (api/pos/[[...path]].js)
 * and Express (posApiRoutes.js). Single-segment URLs so no vercel.json rewrites are needed.
 */
import { PERMISSIONS } from "../../companyRouteAccess.js";
import { requirePosPermission, requireSettingsManager } from "../posConnectionsRoutes.js";
import {
  handleKitchenAction,
  handleKitchenGet,
  handleRestaurantFloor,
  handleRestaurantOrders,
  handleRestaurantSetup,
  handleTabAction,
  handleTabGet,
  handleTabPay,
} from "./posRestaurantRoutes.js";

const SETTINGS = "settings";

/** route name → { path, METHOD: [permission, handler] } */
export const RESTAURANT_ROUTES = Object.freeze({
  "restaurant-floor": { path: "/api/pos/floor", GET: [PERMISSIONS.POS_ACCESS, handleRestaurantFloor] },
  "restaurant-floor-setup": {
    path: "/api/pos/floor-setup",
    GET: [PERMISSIONS.POS_ACCESS, handleRestaurantFloor],
    POST: [SETTINGS, handleRestaurantSetup],
  },
  "restaurant-tab": {
    path: "/api/pos/tab",
    GET: [PERMISSIONS.POS_ACCESS, handleTabGet],
    POST: [PERMISSIONS.POS_SELL, handleTabAction],
  },
  "restaurant-tab-pay": { path: "/api/pos/tab-pay", POST: [PERMISSIONS.POS_SELL, handleTabPay] },
  "restaurant-kitchen": {
    path: "/api/pos/kitchen",
    GET: [PERMISSIONS.POS_ACCESS, handleKitchenGet],
    POST: [PERMISSIONS.POS_ACCESS, handleKitchenAction],
  },
  "restaurant-orders": { path: "/api/pos/orders", GET: [PERMISSIONS.POS_ACCESS, handleRestaurantOrders] },
});

export { RESTAURANT_ROUTE_BY_HEAD } from "./posRestaurantRouteNames.js";

export function isRestaurantRoute(route) {
  return Object.prototype.hasOwnProperty.call(RESTAURANT_ROUTES, route);
}

export async function dispatchRestaurantRoute(route, req, res) {
  const entry = RESTAURANT_ROUTES[route];
  const method = String(req.method || "GET").toUpperCase();
  const handler = entry?.[method];
  if (!handler) {
    const allowed = entry ? ["GET", "POST"].filter((m) => entry[m]) : [];
    res.setHeader("Allow", [...allowed, "OPTIONS"].join(", "));
    return res.status(405).json({ error: "Method not allowed" });
  }
  const [permission, fn] = handler;
  const gate = permission === SETTINGS ? await requireSettingsManager(req, res) : await requirePosPermission(req, res, permission);
  if (!gate.ok) return gate.response;
  return fn(req, res, gate);
}

export function registerRestaurantRoutes(app) {
  for (const [route, entry] of Object.entries(RESTAURANT_ROUTES)) {
    if (entry.GET) app.get(entry.path, (req, res) => dispatchRestaurantRoute(route, req, res));
    if (entry.POST) app.post(entry.path, (req, res) => dispatchRestaurantRoute(route, req, res));
  }
}
