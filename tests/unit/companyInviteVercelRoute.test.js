import { describe, expect, it } from "vitest";
import { resolveCompanyRoute } from "../../server/src/company/companyVercelRoute.js";

function req({ path, url, query = {}, method = "GET" }) {
  return {
    method,
    url: url || "/api/company",
    query: path !== undefined ? { path, ...query } : query,
  };
}

describe("resolveCompanyRoute", () => {
  it("keeps one-segment invite list and create routes", () => {
    expect(resolveCompanyRoute(req({ path: "invites" }))).toEqual({
      route: "invites-list",
      parts: ["invites"],
    });
    expect(resolveCompanyRoute(req({ path: "invite" })).route).toBe("team-invite");
  });

  it("resolves vercel.json one-segment aliases with query id", () => {
    expect(
      resolveCompanyRoute(req({ path: "invite-resend", query: { id: "invite-1" } }))
    ).toEqual({
      route: "invite-resend",
      parts: ["invite-resend"],
      id: "invite-1",
    });
    expect(
      resolveCompanyRoute(req({ path: "invite-by-id", query: { id: "invite-1" }, method: "DELETE" }))
    ).toEqual({
      route: "invite-revoke",
      parts: ["invite-by-id"],
      id: "invite-1",
    });
    expect(resolveCompanyRoute(req({ path: "invite-validate" })).route).toBe("invite-validate");
  });

  it("still maps nested invite paths when they reach the handler", () => {
    expect(
      resolveCompanyRoute(
        req({ path: ["invites", "invite-1", "resend"], url: "/api/company/invites/invite-1/resend" })
      )
    ).toEqual({
      route: "invite-resend",
      parts: ["invites", "invite-1", "resend"],
      id: "invite-1",
    });
    expect(
      resolveCompanyRoute(
        req({
          path: ["invites", "invite-1"],
          url: "/api/company/invites/invite-1",
          method: "DELETE",
        })
      )
    ).toEqual({
      route: "invite-revoke",
      parts: ["invites", "invite-1"],
      id: "invite-1",
    });
    expect(
      resolveCompanyRoute(req({ path: ["invite", "validate"], url: "/api/company/invite/validate" }))
        .route
    ).toBe("invite-validate");
  });

  it("falls back to req.url and query.id for flattened rewrites", () => {
    expect(
      resolveCompanyRoute({
        url: "/api/company/invite-resend?id=invite-1",
        query: { path: "invite-resend", id: "invite-1" },
      })
    ).toEqual({
      route: "invite-resend",
      parts: ["invite-resend"],
      id: "invite-1",
    });
  });
});
