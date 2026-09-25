/**
 * Payroll statutory rules exactly as the migrations insert them (platform rows, org_id null), parsed
 * from the SQL so tests prove the shipped data rather than retyped numbers.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIG = (f) => readFileSync(fileURLToPath(new URL(`../../../supabase/migrations/${f}`, import.meta.url)), "utf8");

/** Rules exactly as the migrations insert them (platform rows, org_id null). */
export function shippedRules() {
  const legacy = MIG("20260902120000_payroll_engine_and_leave_ledger.sql");
  const sars = MIG("20260925140000_payroll_sars_tax_years_and_ytd.sql");
  const rules = [];
  // Legacy seed: ('CODE', 'name', 'type', '{json}', employee, employer) effective 2000-01-01.
  for (const m of legacy.matchAll(/\(\s*'(PAYE|UIF|UIF_EMPLOYER|SDL)',\s*'([^']+)',\s*'(\w+)',\s*'(\{[\s\S]*?\})',\s*(true|false),\s*(true|false)\s*\)/g)) {
    rules.push({
      id: `legacy-${m[1]}`,
      org_id: null,
      code: m[1],
      name: m[2],
      calculation_type: m[3],
      value: JSON.parse(m[4]),
      employee_portion: m[5] === "true",
      employer_portion: m[6] === "true",
      effective_from: "2000-01-01",
      // The new migration closes these windows:
      effective_to: m[1] === "PAYE" ? "2025-02-28" : "2026-02-28",
    });
  }
  // SARS PAYE versions: ('PAYE', 'name', DATE 'from', DATE 'to', '{json}')
  for (const m of sars.matchAll(/\(\s*'PAYE',\s*'([^']+)',\s*DATE '([\d-]+)',\s*DATE '([\d-]+)',\s*'(\{[\s\S]*?\})'\s*\)/g)) {
    rules.push({
      id: `paye-${m[2]}`,
      org_id: null,
      code: "PAYE",
      name: m[1],
      calculation_type: "tax_brackets",
      value: JSON.parse(m[4]),
      employee_portion: true,
      effective_from: m[2],
      effective_to: m[3],
    });
  }
  // UIF / SDL from 2026-03-01: ('CODE', 'name', 'type', '{json}', employee, employer)
  const uifSdl = sars.slice(sars.indexOf("── 2. UIF / SDL"));
  for (const m of uifSdl.matchAll(/\(\s*'(UIF|UIF_EMPLOYER|SDL)',\s*'([^']+)',\s*'(\w+)',\s*'(\{[\s\S]*?\})',\s*(true|false),\s*(true|false)\s*\)/g)) {
    rules.push({
      id: `${m[1]}-2026`,
      org_id: null,
      code: m[1],
      name: m[2],
      calculation_type: m[3],
      value: JSON.parse(m[4]),
      employee_portion: m[5] === "true",
      employer_portion: m[6] === "true",
      effective_from: "2026-03-01",
      effective_to: null,
    });
  }
  return rules;
}

