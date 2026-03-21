#!/usr/bin/env node
/**
 * Scans git-tracked source files for patterns that often indicate committed secrets.
 * Run: npm run scan-secrets
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SKIP_PATH =
  /node_modules|\/dist\/|coverage\/|\.lock$|playwright-report|\.playwright-browsers|\/mcps\//;
const SCAN_EXT = /\.(jsx?|tsx?|mjs|cjs|html|toml)$/i;

const LINE_ALLOWLIST = [
  /NOT the service_role/i,
  /never use the service_role/i,
  /service_role key never/i,
  /not service_role/i,
  /your-anon-key/i,
  /your_service_role_key_here/i,
  /test-anon-key/i,
  /https:\/\/test\.supabase\.co/i,
];

const RULES = [
  {
    id: "vite-service-role",
    desc: "VITE_* must never expose service role or generic secrets",
    test: (line) =>
      /^[^#]*VITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY)/i.test(line),
  },
  {
    id: "assigned-service-role-value",
    desc: "SUPABASE_SERVICE_ROLE_KEY must not be assigned a real value in source",
    test: (line) => {
      const m = line.match(/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]([^'"]+)['"]/);
      if (!m) return false;
      const v = m[1].trim();
      if (!v || v.length < 24) return false;
      if (/your_|placeholder|example|here|\$\{/i.test(v)) return false;
      return true;
    },
  },
  {
    id: "inline-jwt",
    desc: "Hardcoded JWT-like string",
    test: (line) => {
      if (/\.{3}|your_|example|test-anon|not-configured/i.test(line)) return false;
      return /['"](eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)['"]/.test(line);
    },
  },
  {
    id: "stripe-live-secret",
    desc: "Stripe live secret key pattern",
    test: (line) => /sk_live_[0-9a-zA-Z]{20,}/.test(line),
  },
  {
    id: "pem-private-key",
    desc: "PEM private key block",
    test: (line) => /BEGIN [A-Z ]*PRIVATE KEY/.test(line),
  },
];

function getTrackedFiles() {
  try {
    const out = execSync("git ls-files", {
      encoding: "utf8",
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((p) => !SKIP_PATH.test(p) && SCAN_EXT.test(p));
  } catch {
    const dirs = ["src", path.join("server", "src"), "api", path.join("supabase", "functions")];
    const files = [];
    function walk(d) {
      const full = path.join(ROOT, d);
      if (!fs.existsSync(full)) return;
      for (const name of fs.readdirSync(full, { withFileTypes: true })) {
        const rel = path.join(d, name.name);
        if (name.isDirectory()) {
          if (name.name === "node_modules" || name.name === "dist") continue;
          walk(rel);
        } else if (SCAN_EXT.test(name.name)) {
          files.push(rel);
        }
      }
    }
    dirs.forEach(walk);
    return files;
  }
}

function allowedLine(line) {
  return LINE_ALLOWLIST.some((re) => re.test(line));
}

function main() {
  const files = getTrackedFiles();
  const findings = [];

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let content;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (allowedLine(line)) return;
      for (const rule of RULES) {
        if (rule.test(line)) {
          findings.push({
            file: rel,
            line: i + 1,
            rule: rule.id,
            desc: rule.desc,
            snippet: line.trim().slice(0, 120),
          });
          break;
        }
      }
    });
  }

  if (findings.length === 0) {
    console.log(`scan-secrets: OK (${files.length} files checked)`);
    process.exit(0);
  }

  console.error("scan-secrets: potential secrets or unsafe patterns found:\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} [${f.rule}] ${f.desc}`);
    console.error(`    ${f.snippet}\n`);
  }
  process.exit(1);
}

main();
