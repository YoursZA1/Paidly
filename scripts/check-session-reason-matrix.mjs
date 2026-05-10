import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");
const codeExt = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

const NETWORK_TOKENS = [
  "offline",
  "network",
  "timeout",
  "timed out",
  "failed to fetch",
  "reconnect",
  "session_missing",
  "background_sync",
  "tab_visible",
];

const ALLOWED_TERMINAL_REASONS = new Set([
  "inactivity_timeout",
  "session_missing_after_reconnect",
  "refresh_token_invalid",
  "fatal_refresh_token",
  "auth_expired",
  "session_revoked",
  "signed_out",
  "signed_out_in_another_tab",
  "forced_sign_out",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (codeExt.has(path.extname(abs))) out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(repoRoot, abs).split(path.sep).join("/");
}

function isNetworkLike(reason) {
  const normalized = String(reason || "").toLowerCase();
  return NETWORK_TOKENS.some((token) => normalized.includes(token));
}

function isExplicitAllowedTerminal(reason) {
  return ALLOWED_TERMINAL_REASONS.has(String(reason || "").toLowerCase());
}

const files = walk(srcRoot);
const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const relative = rel(file);

  const transitionRegex = /transitionToExpired\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = transitionRegex.exec(content))) {
    const reason = match[1];
    if (isExplicitAllowedTerminal(reason)) continue;
    if (!isNetworkLike(reason)) continue;
    const line = content.slice(0, match.index).split("\n").length;
    violations.push({ file: relative, line, kind: "transitionToExpired", reason });
  }

  const expiredStatusRegex =
    /(?:setSessionHealthStatus|applySessionHealthFromAuthority)\s*\(\s*SESSION_STATUS\s*\.\s*EXPIRED\s*,\s*["'`]([^"'`]+)["'`]/g;
  while ((match = expiredStatusRegex.exec(content))) {
    const reason = match[1];
    if (isExplicitAllowedTerminal(reason)) continue;
    if (!isNetworkLike(reason)) continue;
    const line = content.slice(0, match.index).split("\n").length;
    violations.push({ file: relative, line, kind: "sessionHealth EXPIRED", reason });
  }
}

if (violations.length > 0) {
  console.error("\nSession reason matrix violations found:\n");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.kind}("${v.reason}")`);
  }
  console.error(
    "\nNetwork/transport reasons must not transition to terminal auth state. " +
      "Use reconnect/degraded paths for network issues.\n"
  );
  process.exit(1);
}

console.log("Session reason matrix check passed.");

