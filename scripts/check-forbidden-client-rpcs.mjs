import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, "src");
const forbiddenRpcNames = new Set(["expire_trial_if_due", "bootstrap_user_organization"]);
const allowedFiles = new Set([
  "src/lib/supabaseClient.js", // allowed for browser-side blocklist declaration
]);

const codeExt = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

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

const files = walk(srcRoot);
const violations = [];

for (const file of files) {
  const relative = rel(file);
  if (allowedFiles.has(relative)) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const name of forbiddenRpcNames) {
    const pattern = new RegExp(`\\brpc\\s*\\(\\s*["'\`]${name}["'\`]`, "g");
    let match;
    while ((match = pattern.exec(content))) {
      const line = content.slice(0, match.index).split("\n").length;
      violations.push({ file: relative, line, name });
    }
  }
}

if (violations.length > 0) {
  console.error("\nForbidden privileged RPC references found in client code:\n");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.name}`);
  }
  console.error(
    "\nUse server routes / cron / edge functions with service role instead. " +
      "Client-side references to privileged RPCs are blocked.\n"
  );
  process.exit(1);
}

console.log("Forbidden privileged RPC check passed.");
