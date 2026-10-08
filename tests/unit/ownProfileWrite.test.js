import { describe, expect, it } from "vitest";
import { columnMissingFromWriteError, pickOwnProfilePatch } from "../../server/src/ownProfileWrite.js";

describe("pickOwnProfilePatch", () => {
  it("keeps identity fields and drops plan, role, and subscription columns", () => {
    const patch = pickOwnProfilePatch({
      full_name: "  Ada Lovelace ",
      email: "Ada@Example.com",
      company_name: "Analytical Engines",
      phone: "+27 11 000 0000",
      plan: "enterprise",
      role: "admin",
      subscription_status: "active",
      trial_ends_at: "2099-01-01",
      business: { trading_name: "AE" },
    });
    expect(patch).toEqual({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      company_name: "Analytical Engines",
      phone: "+27 11 000 0000",
      business: { trading_name: "AE" },
    });
  });

  it("ignores non-objects", () => {
    expect(pickOwnProfilePatch(null)).toEqual({});
    expect(pickOwnProfilePatch("nope")).toEqual({});
  });
});

describe("columnMissingFromWriteError", () => {
  it("returns the missing column named in the PostgREST error", () => {
    const patch = { company_website: "https://example.com", full_name: "Ada" };
    expect(
      columnMissingFromWriteError(
        "Could not find the 'company_website' column of 'profiles' in the schema cache",
        patch
      )
    ).toBe("company_website");
  });

  it("returns null for an RLS failure", () => {
    expect(
      columnMissingFromWriteError(
        'new row violates row-level security policy for table "profiles"',
        { full_name: "Ada" }
      )
    ).toBeNull();
  });
});
