import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const uiRoots = [
  path.join(repoRoot, "src/pages"),
  path.join(repoRoot, "src/components"),
  path.join(repoRoot, "src/hooks"),
  path.join(repoRoot, "src/contexts"),
];
const codeExt = new Set([".js", ".jsx", ".ts", ".tsx"]);
const forbiddenPattern =
  /\bpaidly\s*\.\s*entities\s*\.\s*Subscription\s*\.\s*(?:create|update|delete)\s*\(/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
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

const files = uiRoots.flatMap((root) => walk(root));
const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = forbiddenPattern.exec(content))) {
    const line = content.slice(0, match.index).split("\n").length;
    violations.push({ file: rel(file), line, match: match[0] });
  }
}

if (violations.length > 0) {
  console.error("\nForbidden UI admin write pattern found:\n");
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.match}`);
  }
  console.error(
    "\nUse backend-secured admin routes (for example `/api/admin/subscriptions`) " +
      "via API clients in `src/api/*`.\n"
  );
  process.exit(1);
}

console.log("Forbidden UI admin write check passed.");
