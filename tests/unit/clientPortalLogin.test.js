/**
 * Client portal sign-in lookup + session token (api/client-portal/_shared.js, shared with Express).
 *
 * Regression for the 2026-10-02 fuzz audit: the email went straight into `.ilike("email", input)`, so
 * `%` / `_` were wildcards — "%@victim-client.co.za" signed in as whichever client matched, across every
 * business on the platform. The lookup must be an exact (case-insensitive) match.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  findClientsByEmail,
  signPortalToken,
  verifyPortalToken,
} from "../../api/client-portal/_shared.js";

const CLIENTS = [
  { id: "c-1", org_id: "org-a", email: "accounts@victim-client.co.za" },
  { id: "c-2", org_id: "org-b", email: "Jane.Doe@Example.com" },
  { id: "c-3", org_id: "org-c", email: "jane_doe@example.com" },
];

/** PostgreSQL ILIKE with the default `\` escape. */
function ilikeMatches(value, pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "is").test(String(value ?? ""));
}

function fakeSupabase(rows = CLIENTS) {
  const calls = [];
  return {
    calls,
    from() {
      return {
        select() {
          return {
            ilike(column, pattern) {
              calls.push(pattern);
              return Promise.resolve({ data: rows.filter((r) => ilikeMatches(r[column], pattern)), error: null });
            },
          };
        },
      };
    },
  };
}

describe("findClientsByEmail", () => {
  it.each([
    ["%", "bare wildcard"],
    ["%@victim-client.co.za", "domain wildcard"],
    ["accounts@victim-client.co.z_", "single-char wildcard"],
    ["a%", "prefix wildcard"],
  ])("does not treat %s as a pattern (%s)", async (email) => {
    const sb = fakeSupabase();
    const { clients } = await findClientsByEmail(sb, email);
    expect(clients).toEqual([]);
  });

  it("escapes LIKE metacharacters before they reach the database", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("an underscore in a real address only matches that address", async () => {
    const { clients } = await findClientsByEmail(fakeSupabase(), "jane_doe@example.com");
    expect(clients.map((c) => c.id)).toEqual(["c-3"]);
  });

  it("still matches the exact address case-insensitively", async () => {
    const { clients } = await findClientsByEmail(fakeSupabase(), "  JANE.DOE@example.COM ");
    expect(clients.map((c) => c.id)).toEqual(["c-2"]);
  });

  it.each([null, undefined, "", "   ", 42, ["a@b.co"], { email: "a@b.co" }, "no-at-sign", "a@b", "x".repeat(300) + "@b.co"])(
    "rejects malformed input %j without querying",
    async (email) => {
      const sb = fakeSupabase();
      const { clients, error } = await findClientsByEmail(sb, email);
      expect(clients).toEqual([]);
      expect(error).toBeTruthy();
      expect(sb.calls).toEqual([]);
    }
  );

  it("does not leak database error text", async () => {
    const sb = {
      from: () => ({
        select: () => ({ ilike: () => Promise.resolve({ data: null, error: { message: 'relation "clients" ...' } }) }),
      }),
    };
    const { error } = await findClientsByEmail(sb, "a@b.co");
    expect(error).toBe("Lookup failed");
  });
});

describe("portal session token", () => {
  beforeAll(() => {
    process.env.CLIENT_PORTAL_JWT_SECRET = "test-portal-secret-for-unit-tests";
  });

  it("round-trips a valid token", () => {
    const token = signPortalToken("c-1", "Accounts@Victim-Client.co.za");
    expect(verifyPortalToken(token)).toMatchObject({ sub: "c-1", email: "accounts@victim-client.co.za" });
  });

  it("rejects a token whose payload was swapped for another client", () => {
    const token = signPortalToken("c-1", "accounts@victim-client.co.za");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "c-2", email: "jane.doe@example.com", exp: 9e9 })).toString(
      "base64url"
    );
    expect(verifyPortalToken(`${forged}.${sig}`)).toBeNull();
  });

  it.each(["", "abc", "a.b", ".", "x.".repeat(50), null, undefined])("rejects malformed token %j", (token) => {
    expect(verifyPortalToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const realNow = Date.now;
    try {
      const token = signPortalToken("c-1", "accounts@victim-client.co.za");
      Date.now = () => realNow() + 8 * 24 * 60 * 60 * 1000;
      expect(verifyPortalToken(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});
