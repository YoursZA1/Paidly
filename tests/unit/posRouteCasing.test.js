import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchRoutes } from "react-router-dom";

const indexSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../src/pages/index.jsx"),
  "utf8"
);

/**
 * React Router matches `path` case-insensitively unless `caseSensitive` is set.
 * A `/POS` → `/pos` <Navigate> therefore never settles and leaves a blank document.
 */
describe("POS route casing", () => {
  it("must not register a case-insensitive /POS redirect onto /pos", () => {
    const unsafe = [
      { path: "/POS", element: "redirect" },
      { path: "/pos", element: "till" },
    ];
    const matched = matchRoutes(unsafe, "/pos");
    expect(matched?.[0]?.route?.element).toBe("redirect");
  });

  it("canonical /pos is the first POS access path and has no sibling /POS redirect", () => {
    const safe = [
      { path: "/pos/till/:tillId", element: "till" },
      { path: "/pos", element: "till" },
    ];
    expect(matchRoutes(safe, "/pos")?.[0]?.route?.element).toBe("till");
    expect(matchRoutes(safe, "/POS")?.[0]?.route?.element).toBe("till");
    expect(matchRoutes(safe, "/pos/till/11111111-1111-4111-8111-111111111111")?.[0]?.route?.element).toBe(
      "till"
    );
  });

  it("Paidly route table does not include the /POS Navigate loop", () => {
    expect(indexSrc).not.toMatch(/path:\s*["']\/POS["'][\s\S]{0,80}RedirectPreserveSearch/);
    expect(indexSrc).toMatch(/path:\s*["']\/pos["']/);
  });
});
