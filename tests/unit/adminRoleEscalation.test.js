import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCallerForAdminRoute, jwtKnownStaffRole } from "../../server/src/adminRouteAccess.js";
import { resolveUserRoleFromSessionAndProfile } from "@/lib/staffDashboard.js";

/** Minimal supabase stub: profiles lookup returns the given row. */
function supabaseWithProfile(profile) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
      }),
    }),
  };
}

describe("platform admin cannot be self-granted via user_metadata", () => {
  const attacker = { id: "u-1", email: "x@example.com", user_metadata: { role: "admin" }, app_metadata: {} };

  it("ignores user_metadata.role when reading JWT staff roles", () => {
    expect(jwtKnownStaffRole(attacker)).toBe("");
    expect(jwtKnownStaffRole({ app_metadata: { role: "admin" } })).toBe("admin");
  });

  it("denies strict admin routes for a user_metadata 'admin'", async () => {
    const deny = await assertCallerForAdminRoute(supabaseWithProfile({ role: null }), attacker, {});
    expect(deny?.status).toBe(403);
  });

  it("denies internal-team routes for a user_metadata staff role", async () => {
    const deny = await assertCallerForAdminRoute(
      supabaseWithProfile({ role: null }),
      { ...attacker, user_metadata: { role: "management" } },
      { allowInternalTeam: true }
    );
    expect(deny?.status).toBe(403);
  });

  it("still allows server-granted admins (app_metadata) and invited staff (profiles.role)", async () => {
    expect(
      await assertCallerForAdminRoute(supabaseWithProfile(null), { id: "a", app_metadata: { role: "admin" } }, {})
    ).toBeNull();
    expect(
      await assertCallerForAdminRoute(supabaseWithProfile({ role: "support" }), { id: "s", app_metadata: {} }, {
        allowInternalTeam: true,
      })
    ).toBeNull();
  });

  it("client role resolution also ignores user_metadata", () => {
    expect(resolveUserRoleFromSessionAndProfile(attacker, {})).toBe("user");
  });
});

describe("security migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20260919160000_security_profile_role_guard.sql", import.meta.url),
    "utf8"
  );

  it("guards role and billing cache columns on profiles for end-user sessions", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.profiles/);
    for (const col of ["'role'", "'user_role'", "'plan'", "'subscription_status'", "'is_pro'", "'trial_ends_at'"]) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/);
  });

  it("never accepts 'admin' from signup metadata and requires a server-issued invite", () => {
    const block = sql.slice(sql.indexOf("v_staff_role := lower"), sql.indexOf("END IF;", sql.indexOf("v_staff_role := lower")));
    expect(block).toContain("NOT v_is_invited");
    expect(block).toContain("NOT IN ('management', 'sales', 'support')");
    expect(block).not.toContain("'admin'");
  });
});
