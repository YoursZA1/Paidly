#!/usr/bin/env node
/**
 * Fail the build if app code (src/, shared/, server/, api/) references an identifier that is never
 * defined or imported (ESLint no-undef).
 * Vite does not catch these; they surface as a ReferenceError only when the code path runs
 * (e.g. the POS Ozow return path once called an un-imported fetchOrgPaymentIntent).
 * Run: node scripts/check-undefined-identifiers.mjs
 */
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });
const results = await eslint.lintFiles(["src/**/*.{js,jsx}", "shared/**/*.js", "server/src/**/*.{js,jsx}", "api/**/*.js"]);
const offenders = results.flatMap((r) =>
  r.messages
    .filter((m) => m.ruleId === "no-undef")
    .map((m) => `  - ${r.filePath.replace(`${process.cwd()}/`, "")}:${m.line}  ${m.message}`)
);

if (offenders.length) {
  console.error("Undefined identifiers (would throw ReferenceError at runtime):\n");
  console.error(offenders.join("\n"));
  process.exit(1);
}

console.log(`OK: no undefined identifiers (${results.length} files).`);
