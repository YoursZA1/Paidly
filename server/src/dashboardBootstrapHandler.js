import { createClient } from "@supabase/supabase-js";
import { applyPaidlyServerlessCors } from "./vercelPaidlyCors.js";
import { buildDashboardBootstrapPayload } from "./dashboardBootstrapPayload.js";

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getAnonKey() {
  return String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
}

function bearerFromReq(req) {
  const raw = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * GET /api/dashboard/bootstrap — batched dashboard read model (RLS via user JWT on anon client).
 * @type {import("@vercel/node").VercelApiHandler}
 */
export default async function dashboardBootstrapHandler(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "GET, OPTIONS" });
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = getAnonKey();
  const admin = getServiceSupabase();
  if (!url || !anonKey || !admin) {
    return res.status(503).json({ error: "Server configuration error (Supabase)" });
  }

  const token = bearerFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: authErr?.message || "Invalid or expired token" });
  }

  const userSb = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const y = Number(req.query?.year);
  const calendarYear = Number.isFinite(y) && y > 1900 ? y : new Date().getFullYear();

  try {
    const body = await buildDashboardBootstrapPayload(userSb, {
      userId: authData.user.id,
      calendarYear,
    });
    return res.status(200).json(body);
  } catch (err) {
    const status = Number(err?.status || err?.statusCode || 0);
    const code = String(err?.code || "");
    if (status === 401 || code === "42501") {
      return res.status(403).json({ error: "Forbidden" });
    }
    console.error("[dashboard/bootstrap]", err);
    return res.status(500).json({ error: err?.message || "bootstrap_failed" });
  }
}
