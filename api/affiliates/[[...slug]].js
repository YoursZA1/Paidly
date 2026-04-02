/**
 * Vercel serverless (single function): GET /api/affiliates + POST /api/affiliates/resend-link
 * Keeps Hobby serverless count ≤12 by merging former index.js + resend-link.js.
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

async function canAccessAffiliateAdminBundle(supabase, userId, jwtUser) {
  const jwtRole = String(jwtUser?.app_metadata?.role || "").toLowerCase();
  if (jwtRole === "admin") return true;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, user_role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  const r = String(data?.role || data?.user_role || "").toLowerCase();
  return r === "admin" || r === "management" || r === "support";
}

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function buildOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return "";
  return `${proto}://${host}`;
}

async function requireAdmin(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return false;
  const r = String(data?.role || "").toLowerCase();
  return r === "admin" || r === "management";
}

function normalizeSlug(req) {
  const raw = req.query?.slug;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function handleGetAffiliateBundle(req, res, supabase) {
  let limit = 150;
  const q = req.query?.limit;
  if (q != null && String(q).trim() !== "") {
    const n = Number(String(q).trim());
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–500)" });
    }
    limit = n;
  }

  const [appsRes, partnersRes] = await Promise.all([
    supabase.from("affiliate_applications").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("affiliates").select("*").order("created_at", { ascending: false }).limit(limit),
  ]);

  if (appsRes.error) {
    return res.status(500).json({ error: appsRes.error.message });
  }

  const applications = appsRes.data || [];
  const partners = partnersRes.error ? [] : partnersRes.data || [];
  const counts = countAffiliateApplicationsByStatus(applications);
  const data = {
    ok: true,
    applications,
    partners,
    counts,
    ...(partnersRes.error ? { partnerError: partnersRes.error.message } : {}),
  };

  console.log(
    `[GET /api/affiliates] applications=${applications.length} partners=${partners.length} pending=${counts.pending}` +
      (partnersRes.error ? ` partner_fetch_error=${partnersRes.error.message}` : "")
  );
  return res.status(200).json(data);
}

async function handlePostResendLink(req, res, supabase) {
  const resend = getResend();
  if (!resend) return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

  const requesterId = authData.user.id;
  if (!(await requireAdmin(supabase, requesterId))) return res.status(403).json({ error: "Access restricted" });

  const applicationId = req.body?.applicationId || req.body?.application_id || req.body?.id;
  if (!applicationId) return res.status(400).json({ error: "Missing applicationId" });

  const { data: appRow, error: appErr } = await supabase
    .from("affiliate_applications")
    .select("id, email, full_name, status, user_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appRow) return res.status(404).json({ error: "Application not found" });
  if (String(appRow.status).toLowerCase() !== "approved") {
    return res.status(400).json({ error: "Application is not approved" });
  }

  const email = String(appRow.email || "").trim().toLowerCase();
  const userId = appRow.user_id;
  if (!email || !userId) return res.status(400).json({ error: "Application missing email or user_id" });

  const { data: affRow, error: affErr } = await supabase
    .from("affiliates")
    .select("referral_code")
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();

  if (affErr || !affRow?.referral_code) {
    return res.status(404).json({ error: "Affiliate profile not found" });
  }

  const origin = buildOrigin(req);
  const referralCode = String(affRow.referral_code);
  const shareLink = `${origin}/Signup#sign-up?ref=${encodeURIComponent(referralCode)}`;
  const fromAddress = process.env.RESEND_FROM || "Paidly <invoices@paidly.co.za>";

  await resend.emails.send({
    from: fromAddress,
    to: [email],
    subject: "Your Paidly affiliate referral link",
    html: `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a;">
        <p>Hi ${appRow.full_name || "there"}, here is your Paidly affiliate share link:</p>
        <p><strong>Referral code:</strong> ${referralCode}</p>
        <p><strong>Share link:</strong><br/><a href="${shareLink}">${shareLink}</a></p>
      </div>
    `,
  });

  return res.status(200).json({ ok: true, referral_code: referralCode, referral_link: shareLink });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();

  const slug = normalizeSlug(req);
  const head = slug[0];

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

  if (!head) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

    const requesterId = authData.user.id;
    if (!(await canAccessAffiliateAdminBundle(supabase, requesterId, authData.user))) {
      return res.status(403).json({ error: "Access restricted" });
    }

    return handleGetAffiliateBundle(req, res, supabase);
  }

  if (head === "resend-link") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    return handlePostResendLink(req, res, supabase);
  }

  return res.status(404).json({ error: "Not found" });
}
