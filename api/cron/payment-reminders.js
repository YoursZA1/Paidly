/**
 * Secured cron entrypoint for payment reminders (and future batch jobs).
 *
 * Vercel Cron: configure in vercel.json + set CRON_SECRET in project env.
 * Manual: curl -H "Authorization: Bearer $CRON_SECRET" https://www.paidly.co.za/api/cron/payment-reminders
 *
 * Full tenant batch (all users) requires server-side access to persisted reminder settings
 * and invoice rows — extend runPlaceholder below or import shared logic from server/.
 */

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof secret !== "string" || secret.length < 8) {
    return { ok: false, reason: "misconfigured" };
  }
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}

/**
 * Placeholder: wire Supabase service role + Resend here to iterate orgs/users.
 * Client-side PaymentReminderScheduler still runs daily when the app is open.
 */
async function runPaymentReminderBatch() {
  return {
    ran: false,
    processedUsers: 0,
    message:
      "Batch not implemented yet. Persist reminder_settings to profiles (or JSONB) and query invoices by org_id, then send via Resend. See docs/CRON_PAYMENT_REMINDERS.md",
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authz = isAuthorized(req);
  if (authz.reason === "misconfigured") {
    return res.status(503).json({
      error: "CRON_SECRET is not set (min 8 chars). Add it in Vercel env for production.",
    });
  }
  if (authz.reason === "unauthorized") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const batch = await runPaymentReminderBatch();
    return res.status(200).json({
      ok: true,
      at: new Date().toISOString(),
      path: "payment-reminders",
      ...batch,
    });
  } catch (e) {
    console.error("[cron/payment-reminders]", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
}
