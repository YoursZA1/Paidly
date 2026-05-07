import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const targetRoots = [
  "src/components/connection",
  "src/components/sync",
  "src/hooks/useSupabaseRealtime.js",
];

const allowedExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

const forbiddenPatterns = [
  { label: "logout call", regex: /\blogout\s*\(/ },
  { label: "signOut call", regex: /\bsignOut\s*\(/ },
  { label: "terminal session health", regex: /setSessionHealthStatus\s*\(\s*SESSION_STATUS\s*\.\s*EXPIRED/ },
  { label: "direct auth session patch", regex: /\bpatchAuthSession\s*\(/ },
  { label: "direct unauthorized trigger", regex: /\btriggerUnauthorizedSession\s*\(/ },
];

function isCodeFile(filePath) {
  return allowedExtensions.has(path.extname(filePath));
}

function walkFiles(absPath, out = []) {
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    if (isCodeFile(absPath)) out.push(absPath);
    return out;
  }
  for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    walkFiles(path.join(absPath, entry.name), out);
  }
  return out;
}

function toRel(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

const files = [];
for (const target of targetRoots) {
  const abs = path.join(repoRoot, target);
  if (!fs.existsSync(abs)) continue;
  walkFiles(abs, files);
}

const violations = [];

for (const absFile of files) {
  const content = fs.readFileSync(absFile, "utf8");
  const rel = toRel(absFile);

  for (const p of forbiddenPatterns) {
    const match = content.match(p.regex);
    if (!match) continue;

    const before = content.slice(0, match.index);
    const line = before.split("\n").length;
    violations.push({
      file: rel,
      line,
      label: p.label,
      snippet: match[0],
    });
  }
}

if (violations.length > 0) {
  console.error("\nSession boundary violations found:\n");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.label} (${v.snippet})`);
  }
  console.error(
    "\nConnection/realtime modules must not force auth expiry/logout directly. " +
      "Route terminal auth transitions through SessionDecisionEngine + rpcSessionPolicy.\n"
  );
  process.exit(1);
}

console.log("Session boundary check passed.");
