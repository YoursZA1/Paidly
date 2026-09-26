/**
 * Every Vercel function must load under plain Node ESM — the way Vercel runs it.
 *
 * Vitest transforms modules through Vite, which silently accepts things Node rejects at load
 * time (JSX in a .js file, a name exported twice). Both shipped to production on 2026-09-26 and
 * took down /api/pos/* and every /api/public-share route with FUNCTION_INVOCATION_FAILED while
 * the unit suite stayed green. This test imports each entry point in a child `node` process.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const API_DIR = join(ROOT, "api");

function listFunctionEntryPoints(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    // `_shared.js` helpers are not functions; `._*` are macOS AppleDouble sidecars.
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFunctionEntryPoints(full));
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

const entryPoints = listFunctionEntryPoints(API_DIR);

// Placeholder values only — the modules validate the key format at import time.
const DUMMY_ENV = {
  ...process.env,
  SUPABASE_URL: "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_placeholder_for_load_test",
  SUPABASE_ANON_KEY: "placeholder",
  VITE_SUPABASE_URL: "http://127.0.0.1:1",
  VITE_SUPABASE_ANON_KEY: "placeholder",
};

describe("Vercel functions load under native Node ESM", () => {
  it("stays within the Hobby plan's 12 functions", () => {
    expect(entryPoints.length).toBeLessThanOrEqual(12);
  });

  it.each(entryPoints.map((f) => [relative(ROOT, f), f]))("%s", (_label, file) => {
    const script = `const m = await import(${JSON.stringify(new URL(`file://${file}`).href)});
if (typeof m.default !== "function") { console.error("default export is not a handler"); process.exit(2); }`;
    let error = null;
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: ROOT,
        env: DUMMY_ENV,
        stdio: "pipe",
        timeout: 60_000,
      });
    } catch (e) {
      error = String(e.stderr || e.message).split("\n").find((l) => /Error|default export/.test(l)) || String(e.message);
    }
    expect(error).toBeNull();
  }, 70_000);
});
