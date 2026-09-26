#!/usr/bin/env node
/**
 * Writes the Paidly-branded Supabase Auth email templates to supabase/templates/ from
 * server/src/auth/paidlyAuthEmails.js (single source of truth; a unit test checks they are in sync).
 * Local CLI reads them via supabase/config.toml; production: paste each file into
 * Supabase Dashboard → Authentication → Email Templates (see docs/AUTH_EMAIL_BRANDING.md).
 * Run: node scripts/generate-auth-email-templates.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { confirmSignupDocFile, SUPABASE_AUTH_TEMPLATE_FILES } from "../server/src/auth/paidlyAuthEmails.js";

for (const [file, build] of Object.entries(SUPABASE_AUTH_TEMPLATE_FILES)) {
  const out = fileURLToPath(new URL(`../supabase/templates/${file}`, import.meta.url));
  writeFileSync(out, build());
  console.log(`wrote supabase/templates/${file}`);
}

const doc = fileURLToPath(new URL("../docs/EMAIL_CONFIRMATION_TEMPLATE.html", import.meta.url));
writeFileSync(doc, confirmSignupDocFile());
console.log("wrote docs/EMAIL_CONFIRMATION_TEMPLATE.html");
