/**
 * Vercel serverless handler for send-email (invoice/quote with download link).
 * Requires in Vercel env: RESEND_API_KEY, RESEND_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Note: Use SUPABASE_URL (not VITE_SUPABASE_URL); VITE_* vars are frontend-only and not available in Node.
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export default async function handler(req, res) {
  // CORS: reflect request origin when present; do not use "*" with Authorization (per CORS spec).
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const supabase = getSupabase();
  if (!supabase) {
    const missing = [];
    if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    return res.status(503).json({
      error: "Server configuration error (Supabase)",
      detail: missing.length ? `Missing: ${missing.join(", ")}. Set these in Vercel env (not VITE_*).` : undefined,
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: userError?.message || "Invalid or expired token" });
  }

  const { to, subject, body } = req.body || {};
  if (!to || !subject) {
    return res.status(400).json({ error: "Missing to or subject", fields: ["to", "subject"] });
  }

  const resend = getResend();
  if (!resend) {
    return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
  }

  const fromAddress = process.env.RESEND_FROM || "Paidly <sales@paidly.co.za>";

  try {
    const data = await resend.emails.send({
      from: fromAddress,
      to: [String(to).trim()],
      subject: String(subject).trim(),
      html: typeof body === "string" ? body : "<p>No content.</p>",
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("Resend send-email error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
    });
  }
}
