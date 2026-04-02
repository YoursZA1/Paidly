import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const gitDir = path.join(repoRoot, ".git");
const hooksDir = path.join(gitDir, "hooks");
const sourceHook = path.join(repoRoot, "scripts", "hooks", "pre-commit");
const targetHook = path.join(hooksDir, "pre-commit");

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!exists(gitDir)) {
  console.log("[hooks] .git not found, skipping hook installation.");
  process.exit(0);
}

if (!exists(sourceHook)) {
  console.warn("[hooks] Source pre-commit hook missing, skipping.");
  process.exit(0);
}

fs.mkdirSync(hooksDir, { recursive: true });
fs.copyFileSync(sourceHook, targetHook);
fs.chmodSync(targetHook, 0o755);

console.log("[hooks] Installed .git/hooks/pre-commit");
