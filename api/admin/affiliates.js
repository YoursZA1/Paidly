import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../server/src/adminRouteAccess.js";
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";
import { validateServiceRoleKey } from "../../server/src/supabaseServiceRoleGuard.js";

function cors(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "GET, OPTIONS" });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { client: null, configError: "Server misconfigured (Supabase)." };
  const roleCheck = validateServiceRoleKey(key);
  if (!roleCheck.ok) return { client: null, configError: roleCheck.message };
  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    configError: null,
  };
}

function countAffiliateApplicationsByStatus(rows) {
  let pending = 0;
  let approved = 0;
  let declined = 0;
  for (const row of rows || []) {
    const s = String(row?.status ?? "").toLowerCase();
    if (s === "pending") pending += 1;
    else if (s === "approved" || s === "accepted") approved += 1;
    else if (s === "declined" || s === "rejected") declined += 1;
  }
  return { pending, approved, declined, total: (rows || []).length };
}

function getRequestId(req) {
  return (
    req.headers["x-request-id"] ||
    req.headers["x-vercel-id"] ||
    `admin-affiliates-${Date.now()}`
  );
}

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  cors(req, res);
  res.setHeader("x-request-id", String(requestId));

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed", requestId });
  }

  const { client: supabase, configError } = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({
      error: configError || "Server misconfigured (Supabase)",
      requestId,
    });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token", requestId });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired token", requestId });
  }

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
  if (deny) {
    return res.status(deny.status).json({ ...deny.body, requestId });
  }

  let limit = 150;
  const q = req.query?.limit;
  if (q != null && String(q).trim() !== "") {
    const n = Number(String(q).trim());
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–500)", requestId });
    }
    limit = n;
  }

  try {
    const [appsRes, partnersRes] = await Promise.all([
      supabase
        .from("affiliate_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("affiliates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (appsRes.error) {
      console.error("[GET /api/admin/affiliates] app query failed", {
        requestId,
        error: appsRes.error.message,
      });
      return res.status(500).json({ error: appsRes.error.message, requestId });
    }

    const applications = appsRes.data || [];
    const partners = partnersRes.error ? [] : partnersRes.data || [];
    const counts = countAffiliateApplicationsByStatus(applications);

    if (partnersRes.error) {
      console.warn("[GET /api/admin/affiliates] partner query warning", {
        requestId,
        error: partnersRes.error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      applications,
      partners,
      counts,
      ...(partnersRes.error ? { partnerError: partnersRes.error.message } : {}),
      requestId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/affiliates] unexpected error", { requestId, message });
    return res.status(500).json({ error: "Failed to list affiliate applications", message, requestId });
  }
}
