#!/usr/bin/env node
/**
 * Fail if src/ has supabase.auth.getSession() outside the allow-listed auth authority modules.
 * Run: node scripts/check-getSession-bypass.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const ALLOW = new Set([
  path.join(srcRoot, "core/auth/SessionCoordinator.ts"),
  path.join(srcRoot, "contexts/AuthContext.impl.jsx"),
  path.join(srcRoot, "services/SupabaseAuthService.js"),
  path.join(srcRoot, "lib/supabaseAuthRefresh.js"),
]);

const PATTERN = /supabase\.auth\.getSession\s*\(/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("._")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(srcRoot)) {
  if (ALLOW.has(file)) continue;
  // Strip block + line comments so docstrings do not false-positive.
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  if (PATTERN.test(text)) {
    offenders.push(path.relative(path.join(__dirname, ".."), file));
  }
  PATTERN.lastIndex = 0;
}

if (offenders.length) {
  console.error("Direct supabase.auth.getSession() outside allow-list:\n");
  for (const f of offenders) console.error(`  - ${f}`);
  console.error("\nUse getStableSession / getStableSessionResult from @/core/auth/SessionCoordinator.");
  process.exit(1);
}

console.log("OK: no unexpected getSession bypasses.");
