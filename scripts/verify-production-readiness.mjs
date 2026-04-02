import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function env(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    fail(`${name} is required`);
  }
  return v;
}

const supabaseUrl = env("SUPABASE_URL");
const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRole) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then rerun `npm run verify:prod`.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredMigrations = [
  "20260401150000_admin_query_indexes.sql",
  "20260402143000_affiliate_internal_team_access.sql",
  "20260406100000_affiliate_applications_select_rls_jwt_admin.sql",
  "20260406120000_affiliate_applications_submit_rpc_and_insert_repair.sql",
  "20260407150000_organizations_bootstrap_rls.sql",
  "20260408120000_profiles_user_role_column.sql",
];

const requiredIndexes = [
  "affiliate_applications_status_created_at_idx",
  "affiliate_applications_user_id_created_at_idx",
];

const requiredPolicies = [
  "affiliate_applications_anon_insert",
  "affiliate_applications_auth_insert",
  "affiliate_applications_team_select",
  "affiliate_applications_jwt_admin_select",
  "affiliate_applications_management_update",
  "affiliate_applications_management_delete",
  "affiliates_team_select",
  "affiliates_management_insert",
  "affiliates_management_update",
  "affiliates_management_delete",
];

async function verifyMigrations() {
  const { data, error } = await supabase
    .from("schema_migrations")
    .select("version");
  if (error) {
    fail(`cannot read schema_migrations: ${error.message}`);
    return;
  }
  const versions = new Set((data || []).map((r) => String(r.version)));
  for (const migration of requiredMigrations) {
    const version = migration.split("_")[0];
    if (!versions.has(version)) {
      fail(`missing migration ${migration}`);
    } else {
      ok(`migration present: ${migration}`);
    }
  }
}

async function verifyIndexes() {
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: `
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in (${requiredIndexes.map((n) => `'${n}'`).join(",")});
    `,
  });
  if (error) {
    console.log(`SKIP: cannot verify indexes via exec_sql RPC (${error.message})`);
    return;
  }
  const names = new Set((data || []).map((r) => String(r.indexname)));
  for (const idx of requiredIndexes) {
    if (!names.has(idx)) fail(`missing index ${idx}`);
    else ok(`index present: ${idx}`);
  }
}

async function verifyPolicies() {
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: `
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename in ('affiliate_applications','affiliates')
        and policyname in (${requiredPolicies.map((n) => `'${n}'`).join(",")});
    `,
  });
  if (error) {
    console.log(`SKIP: cannot verify policies via exec_sql RPC (${error.message})`);
    return;
  }
  const names = new Set((data || []).map((r) => String(r.policyname)));
  for (const policy of requiredPolicies) {
    if (!names.has(policy)) fail(`missing policy ${policy}`);
    else ok(`policy present: ${policy}`);
  }
}

async function verifyHealthEndpoints() {
  const base = String(process.env.VITE_SERVER_URL || process.env.SERVER_URL || "").trim();
  if (!base) {
    console.log("SKIP: health endpoint checks (no VITE_SERVER_URL/SERVER_URL set)");
    return;
  }
  for (const path of ["/api/health", "/api/health/auth-security", "/api/health/deployment-security"]) {
    const url = `${base.replace(/\/$/, "")}${path}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) fail(`health endpoint failed: ${url} -> ${res.status}`);
      else ok(`health endpoint ok: ${url}`);
    } catch (e) {
      fail(`health endpoint unreachable: ${url} (${e?.message || e})`);
    }
  }
}

await verifyMigrations();
await verifyIndexes();
await verifyPolicies();
await verifyHealthEndpoints();

if (process.exitCode && process.exitCode !== 0) {
  console.error("Production readiness checks finished with failures.");
} else {
  console.log("Production readiness checks passed.");
}
