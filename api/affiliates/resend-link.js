/**
 * Vercel serverless handler: POST /api/affiliates/resend-link
 *
 * Resends the affiliate referral link email (uses existing affiliate.referral_code).
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
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

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

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

