import { describe, expect, it } from "vitest";
import { resolvePosRoute } from "../../server/src/pos/posVercelRoute.js";

function req({ path, url, query = {} }) {
  return {
    url: url || "/api/pos",
    query: path !== undefined ? { path, ...query } : query,
  };
}

describe("resolvePosRoute", () => {
  it("reads a one-segment catch-all from query.path", () => {
    expect(resolvePosRoute(req({ path: "registers" }))).toEqual({ route: "registers-list" });
    expect(resolvePosRoute(req({ path: "catalog" })).route).toBe("catalog");
  });

  it("splits a nested path string (rewrite query)", () => {
    expect(resolvePosRoute(req({ path: "oauth/status" }))).toEqual({ route: "oauth-status" });
  });

  it("accepts query.path as an array of segments", () => {
    expect(resolvePosRoute(req({ path: ["oauth", "status"] }))).toEqual({ route: "oauth-status" });
    expect(resolvePosRoute(req({ path: ["sales", "cec1a855-6ceb-4be2-bf01-4a4c339f1256", "audit"] }))).toEqual({
      route: "sale-audit",
      id: "cec1a855-6ceb-4be2-bf01-4a4c339f1256",
    });
  });

  it("falls back to req.url when query.path is empty", () => {
    expect(resolvePosRoute(req({ url: "/api/pos/oauth/status" }))).toEqual({ route: "oauth-status" });
    expect(
      resolvePosRoute(req({ url: "/api/pos/sales/cec1a855-6ceb-4be2-bf01-4a4c339f1256/audit" }))
    ).toEqual({
      route: "sale-audit",
      id: "cec1a855-6ceb-4be2-bf01-4a4c339f1256",
    });
  });

  it("resolves vercel.json one-segment aliases", () => {
    expect(resolvePosRoute(req({ path: "oauth-status" }))).toEqual({ route: "oauth-status" });
    expect(resolvePosRoute(req({ path: "invite-activate" }))).toEqual({ route: "invite-activate" });
    expect(resolvePosRoute(req({ path: "access" }))).toEqual({ route: "access" });
    expect(resolvePosRoute(req({ path: "access-end" }))).toEqual({ route: "access-end" });
    expect(resolvePosRoute(req({ path: "receipt-email" }))).toEqual({ route: "receipt-email" });
    expect(resolvePosRoute(req({ path: "sale-audit", query: { id: "sale-1" } }))).toEqual({
      route: "sale-audit",
      id: "sale-1",
    });
    expect(resolvePosRoute(req({ path: "webhook-token", query: { token: "abc" } }))).toEqual({
      route: "webhook",
      token: "abc",
    });
    expect(resolvePosRoute(req({ path: "session-close", query: { id: "sess-1" } }))).toEqual({
      route: "session-close",
      id: "sess-1",
    });
  });

  it("reads __pos after the dummy /api/pos/route rewrite", () => {
    expect(
      resolvePosRoute({
        url: "/api/pos/route?__pos=oauth/status",
        query: { path: "route", __pos: "oauth/status" },
      })
    ).toEqual({ route: "oauth-status" });
  });

  it("does not treat the dummy route segment as a POS resource", () => {
    expect(resolvePosRoute(req({ path: "route", url: "/api/pos/route" }))).toBeNull();
  });
});
