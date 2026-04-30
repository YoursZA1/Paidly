import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function hasValidCronAuth(req) {
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret || secret.length < 8) return false;
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  return auth === `Bearer ${secret}`;
}

async function runBatchExpiry(admin) {
  const { data, error } = await admin.rpc("expire_all_overdue_trials");
  if (error) throw error;
  return { mode: "batch", rows: Number(data || 0) };
}

async function runSingleUserExpiry(admin, bearerToken) {
  if (!bearerToken) return null;
  const { data: authData, error: authErr } = await admin.auth.getUser(bearerToken);
  if (authErr || !authData?.user?.id) return null;
  const { data, error } = await admin.rpc("expire_trial_if_due");
  if (error) throw error;
  return { mode: "user", user_id: authData.user.id, result: data || null };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const admin = getSupabaseAdmin();
    if (hasValidCronAuth(req)) {
      const out = await runBatchExpiry(admin);
      return res.status(200).json({ ok: true, at: new Date().toISOString(), ...out });
    }

    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const out = await runSingleUserExpiry(admin, bearerToken);
    if (!out) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(200).json({ ok: true, at: new Date().toISOString(), ...out });
  } catch (e) {
    console.error("[api/cron/expire-trials]", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
