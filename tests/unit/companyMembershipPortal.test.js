/**
 * Server-side business/workforce context (server/src/companyRouteAccess.js loadCompanyMembership).
 *
 * The SPA sends `X-Paidly-Portal: <slug>` from /employee/<slug>. The slug only selects the portal: the caller
 * must hold an ACTIVE membership in that org, an unknown/invalid slug is denied, and the server never falls
 * back to the business the caller owns (same person: owner of Business B + employee of Padosio).
 */
import { describe, expect, it } from "vitest";
import {
  companyMembershipOptions,
  loadCompanyMembership,
  membershipHasPermission,
  PERMISSIONS,
} from "../../server/src/companyRouteAccess.js";
import { membershipCanEnterPos } from "../../shared/posStaffInvite.js";

const USER = "b0000000-0000-4000-8000-000000000001";
const PADOSIO = "a0000000-0000-4000-8000-0000000000aa";
const OWN = "b0000000-0000-4000-8000-0000000000bb";
const OTHER = "c0000000-0000-4000-8000-0000000000cc";

function fakeAdmin({ memberships = [], organizations = [] } = {}) {
  const tables = { memberships, organizations };
  return {
    from(table) {
      const filters = [];
      const b = {
        select: () => b,
        order: () => b,
        limit: () => b,
        eq: (col, val) => {
          filters.push([col, val]);
          return b;
        },
        maybeSingle: async () => {
          const rows = (tables[table] || []).filter((r) => filters.every(([c, v]) => r[c] === v));
          rows.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
          return { data: rows[0] ?? null, error: null };
        },
      };
      return b;
    },
  };
}

const orgs = [
  { id: OWN, owner_id: USER, portal_slug: "my-personal-business", created_at: "2026-02-01" },
  { id: PADOSIO, owner_id: "someone-else", portal_slug: "padosio", created_at: "2026-01-01" },
  { id: OTHER, owner_id: "third", portal_slug: "another-company", created_at: "2026-01-01" },
];
const baseMemberships = () => [
  { id: "m-own", org_id: OWN, user_id: USER, role: "owner", job_function: "general", created_at: "2026-02-01" },
  { id: "m-pad", org_id: PADOSIO, user_id: USER, role: "employee", job_function: "pos", created_at: "2026-01-01" },
];

const req = (slug) => ({ headers: slug === undefined ? {} : { "x-paidly-portal": slug } });
const load = (admin, slug) => loadCompanyMembership(admin, USER, companyMembershipOptions(req(slug)));

describe("request → portal context", () => {
  it("no header = default context; header = portal slug (invalid → empty, i.e. deny)", () => {
    expect(companyMembershipOptions(req(undefined))).toEqual({});
    expect(companyMembershipOptions(req("Padosio"))).toEqual({ portalSlug: "padosio" });
    expect(companyMembershipOptions(req("admin"))).toEqual({ portalSlug: "" });
    expect(companyMembershipOptions(req("../x"))).toEqual({ portalSlug: "" });
    expect(companyMembershipOptions(req(PADOSIO))).toEqual({ portalSlug: "" }); // id-shaped: never a slug
    expect(companyMembershipOptions(req(""))).toEqual({ portalSlug: "" }); // present but empty: deny
  });
});

describe("loadCompanyMembership", () => {
  it("default context is the business the user owns", async () => {
    const m = await load(fakeAdmin({ memberships: baseMemberships(), organizations: orgs }));
    expect(m).toMatchObject({ orgId: OWN, companyRole: "admin", membershipRole: "owner", portalSlug: null });
  });

  it("inside /employee/padosio the SAME user is a Padosio employee — not an admin", async () => {
    const m = await load(fakeAdmin({ memberships: baseMemberships(), organizations: orgs }), "padosio");
    expect(m).toMatchObject({ orgId: PADOSIO, id: "m-pad", companyRole: "employee", portalSlug: "padosio" });
    expect(membershipHasPermission(m, PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
    expect(membershipHasPermission(m, PERMISSIONS.VIEW_COMPANY_REPORTS)).toBe(false);
    expect(membershipHasPermission(m, PERMISSIONS.VIEW_OWN_PAYSLIPS)).toBe(true);
    expect(membershipHasPermission(m, PERMISSIONS.POS_SELL)).toBe(true);
    expect(membershipCanEnterPos(m)).toBe(true);
  });

  it("another company's slug, unknown, reserved or id-like slugs are denied — never a fallback", async () => {
    const admin = fakeAdmin({ memberships: baseMemberships(), organizations: orgs });
    for (const slug of ["another-company", "nonexistent", "admin", "", "../padosio", OWN]) {
      expect(await load(admin, slug), slug).toBeNull();
    }
  });

  it("revoked or deactivated employment is denied (portal and default context)", async () => {
    const revoked = baseMemberships();
    revoked[1].portal_revoked_at = "2026-09-01";
    expect(await load(fakeAdmin({ memberships: revoked, organizations: orgs }), "padosio")).toBeNull();

    const disabled = baseMemberships();
    disabled[1].disabled_at = "2026-09-01";
    expect(await load(fakeAdmin({ memberships: disabled, organizations: orgs }), "padosio")).toBeNull();

    // pure employee (owns nothing) whose only membership is revoked: default context denied too
    const onlyEmployment = [{ ...baseMemberships()[1], portal_revoked_at: "2026-09-01" }];
    const noOwnOrgs = orgs.filter((o) => o.id !== OWN);
    expect(await load(fakeAdmin({ memberships: onlyEmployment, organizations: noOwnOrgs }))).toBeNull();
  });

  it("POS access switched off → no POS permission or till entry; self-service stays", async () => {
    const ms = baseMemberships();
    ms[1].pos_access_disabled_at = "2026-09-01";
    const m = await load(fakeAdmin({ memberships: ms, organizations: orgs }), "padosio");
    expect(m.posAccessDisabledAt).toBe("2026-09-01");
    expect(membershipHasPermission(m, PERMISSIONS.POS_SELL)).toBe(false);
    expect(membershipHasPermission(m, PERMISSIONS.POS_ACCESS)).toBe(false);
    expect(membershipCanEnterPos(m)).toBe(false);
    expect(membershipHasPermission(m, PERMISSIONS.VIEW_OWN_PAYSLIPS)).toBe(true);
  });

  it("the owner entering their own portal is the owner", async () => {
    const m = await load(fakeAdmin({ memberships: baseMemberships(), organizations: orgs }), "my-personal-business");
    expect(m).toMatchObject({ orgId: OWN, membershipRole: "owner" });
  });
});
