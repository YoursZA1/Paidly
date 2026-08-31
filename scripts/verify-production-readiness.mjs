import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(repoRoot, "server", ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.production") });

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
  "20260407150000_organizations_bootstrap_rls.sql",
  "20260408120000_profiles_user_role_column.sql",
  "20260516120000_revoke_privileged_rpc_from_authenticated.sql",
  "20260516140000_invoices_client_operation_id.sql",
  "20260516160000_api_rate_limit_consume_rpc.sql",
  "20260828120000_drop_affiliate_program.sql",
];

const requiredIndexes = [];

const requiredPolicies = [];

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
  if (requiredIndexes.length === 0) {
    console.log("SKIP: no required indexes configured");
    return;
  }
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
  if (requiredPolicies.length === 0) {
    console.log("SKIP: no required policies configured");
    return;
  }
  const { data, error } = await supabase.rpc("exec_sql", {
    sql: `
      select policyname
      from pg_policies
      where schemaname = 'public'
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

async function verifyWaveHardening() {
  const { error: colError } = await supabase.from("invoices").select("client_operation_id").limit(0);
  if (colError && /column|schema cache|does not exist/i.test(colError.message || "")) {
    fail("invoices.client_operation_id column missing — apply 20260516140000_invoices_client_operation_id.sql");
  } else if (colError) {
    console.log(`SKIP: invoices.client_operation_id probe (${colError.message})`);
  } else {
    ok("invoices.client_operation_id column present");
  }

  const { data: rlData, error: rlError } = await supabase.rpc("consume_rate_limit_bucket", {
    p_bucket_key: "verify-prod-readiness",
    p_max_hits: 1000,
    p_window_seconds: 60,
  });
  if (rlError) {
    fail(
      `consume_rate_limit_bucket RPC missing — apply 20260516160000_api_rate_limit_consume_rpc.sql (${rlError.message})`
    );
  } else if (rlData?.ok !== true && rlData?.ok !== false) {
    fail("consume_rate_limit_bucket returned unexpected payload");
  } else {
    ok("consume_rate_limit_bucket RPC callable (shared auth rate limits)");
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
await verifyWaveHardening();
await verifyIndexes();
await verifyPolicies();
await verifyHealthEndpoints();

{
  const skipIp = String(process.env.PAYFAST_ITN_SKIP_IP_CHECK || "").trim().toLowerCase();
  if (skipIp === "1" || skipIp === "true" || skipIp === "yes") {
    fail("PAYFAST_ITN_SKIP_IP_CHECK must not be set in production");
  } else {
    ok("PAYFAST_ITN_SKIP_IP_CHECK unset (ITN IP checks enabled)");
  }
}

if (process.exitCode && process.exitCode !== 0) {
  console.error("Production readiness checks finished with failures.");
} else {
  console.log("Production readiness checks passed.");
}
