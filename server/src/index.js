import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  getPayfastFrequency,
  getPayfastProcessUrl,
  signPayfastPayload,
  verifyPayfastSignature
} from "./payfast.js";
import { sendInvoiceEmail, sendHtmlEmail } from "./sendInvoice.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { getUserFromRequest } from "./supabaseAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from server directory (so it works when run from project root or server/)
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const port = Number(process.env.PORT) || 5179;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "invoicebreek";
// Parse ADMIN_BYPASS_AUTH: accept "true", "1", "yes", "on" (case-insensitive)
const adminBypassEnv = (process.env.ADMIN_BYPASS_AUTH || "").toLowerCase().trim();
const adminBypassEnabled = ["true", "1", "yes", "on"].includes(adminBypassEnv);
const adminBypassEmails = (process.env.ADMIN_BYPASS_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

/** Log admin API calls for monitoring sync and permission issues */
function logAdminApi(method, path, statusCode, detail = null) {
  const msg = detail ? `[admin] ${method} ${path} ${statusCode} - ${detail}` : `[admin] ${method} ${path} ${statusCode}`;
  if (statusCode >= 400) {
    console.error(msg);
  } else {
    console.log(msg);
  }
}

/**
 * Resolve admin caller from request: must be authenticated, then either
 * app_metadata.role === "admin" OR (when ADMIN_BYPASS_AUTH is true) email in ADMIN_BYPASS_EMAILS.
 * Bypass is only allowed when both ADMIN_BYPASS_AUTH is true AND email is in the list.
 */
const getAdminFromRequest = async (req, res) => {
  const { user, error } = await getUserFromRequest(req);
  if (error) {
    logAdminApi(req.method, req.path, 401, error);
    res.status(401).json({ error });
    return null;
  }

  const requesterRole = user?.app_metadata?.role || user?.app_metadata?.claims?.role;
  const isAdminByRole = requesterRole === "admin";

  if (!isAdminByRole) {
    const email = user?.email?.toLowerCase();
    const bypassAllowed =
      adminBypassEnabled && !!email && adminBypassEmails.includes(email);
    if (!bypassAllowed) {
      logAdminApi(req.method, req.path, 403, "Admin access required");
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
  }

  return user;
};

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "*",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Track when a client opens an invoice link (tracking_token in message_logs).
 * No auth required; called from public invoice view when URL has ?token=...
 */
app.post("/api/track-open", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing token" });
    }
    const { error } = await supabaseAdmin
      .from("message_logs")
      .update({ viewed: true, opened_at: new Date().toISOString() })
      .eq("tracking_token", token.trim());
    if (error) {
      console.warn("[track-open]", error.message);
      return res.status(500).json({ error: "Failed to record open" });
    }
    return res.json({ ok: true });
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "Track open failed" });
    }
  }
});

/** 1x1 transparent GIF for email open tracking (same 43-byte standard) */
const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Email open tracking pixel: GET /api/email-track/:token
 * When the email client loads the image, we record the open in message_logs.
 * No auth; use same tracking_token as the invoice link.
 */
app.get("/api/email-track/:token", async (req, res) => {
  try {
    const token = (req.params.token || "").trim();
    if (!token) {
      res.set("Content-Type", "image/gif");
      return res.send(TRACKING_PIXEL_GIF);
    }
    await supabaseAdmin
      .from("message_logs")
      .update({ viewed: true, opened_at: new Date().toISOString() })
      .eq("tracking_token", token);
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store, private");
    res.send(TRACKING_PIXEL_GIF);
  } catch (err) {
    if (!res.headersSent) {
      res.set("Content-Type", "image/gif");
      res.send(TRACKING_PIXEL_GIF);
    }
  }
});

app.post("/api/send-invoice", async (req, res) => {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError || !user) {
      return res.status(401).json({ error: authError || "Authentication required" });
    }

    const { base64PDF, clientEmail, invoiceNum, fromName, clientName, amountDue, dueDate } = req.body || {};
    if (!base64PDF || !clientEmail || !invoiceNum) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: ["base64PDF", "clientEmail", "invoiceNum"],
      });
    }

    const template = [clientName, amountDue, dueDate].some(Boolean)
      ? { clientName: clientName?.trim() || "there", amountDue: amountDue ?? "", dueDate: dueDate ?? "" }
      : null;

    const result = await sendInvoiceEmail(
      base64PDF,
      clientEmail.trim(),
      String(invoiceNum).trim(),
      fromName ? String(fromName).trim() : "Paidly",
      template
    );

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || "Send failed" });
    }
  }
});

app.post("/api/send-email", async (req, res) => {
  try {
    const { user, error: authError } = await getUserFromRequest(req);
    if (authError || !user) {
      return res.status(401).json({ error: authError || "Authentication required" });
    }

    const { to, subject, body } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: ["to", "subject"],
      });
    }

    const result = await sendHtmlEmail(
      to.trim(),
      String(subject).trim(),
      typeof body === "string" ? body : "",
      user?.user_metadata?.company_name || "Paidly"
    );

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || "Send failed" });
    }
  }
});

app.post("/api/payfast/subscription", (req, res) => {
  const {
    subscriptionId,
    userId,
    userEmail,
    userName,
    plan,
    billingCycle,
    amount,
    currency,
    returnUrl,
    cancelUrl
  } = req.body || {};

  if (!subscriptionId || !userEmail || !amount) {
    return res.status(400).json({
      error: "Missing required fields",
      fields: ["subscriptionId", "userEmail", "amount"]
    });
  }

  const merchantId = process.env.PAYFAST_MERCHANT_ID || "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || "";
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const notifyUrl = process.env.PAYFAST_NOTIFY_URL || returnUrl;
  const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
  const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;

  if (!merchantId || !merchantKey) {
    return res.status(500).json({
      error: "Payfast merchant credentials not configured"
    });
  }

  const now = new Date();
  const billingDate = now.toISOString().slice(0, 10);
  const frequency = getPayfastFrequency(billingCycle);

  const payload = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: returnUrlResolved,
    cancel_url: cancelUrlResolved,
    notify_url: notifyUrl,
    m_payment_id: `${subscriptionId}-${Date.now()}`,
    amount: Number(amount).toFixed(2),
    item_name: `${plan || "Subscription"} Plan`,
    item_description: `Subscription for ${userName || userEmail}`,
    custom_str1: subscriptionId,
    custom_str2: userId || "",
    custom_str3: billingCycle || "monthly",
    custom_str4: currency || "ZAR",
    email_address: userEmail,
    subscription_type: 1,
    billing_date: billingDate,
    recurring_amount: Number(amount).toFixed(2),
    frequency,
    cycles: 0
  };

  payload.signature = signPayfastPayload(payload, passphrase);

  res.json({
    payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
    fields: payload
  });
});

/**
 * One-time PayFast payment for invoices.
 * Generates a signed PayFast payload for a single invoice payment.
 * This endpoint is intentionally unauthenticated so it can be called from the public invoice view.
 */
app.post("/api/payfast/once", async (req, res) => {
  try {
    const {
      invoiceId,
      amount,
      currency,
      clientName,
      clientEmail,
      returnUrl,
      cancelUrl
    } = req.body || {};

    if (!invoiceId || !amount || !clientEmail) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: ["invoiceId", "amount", "clientEmail"]
      });
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID || "";
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY || "";
    const passphrase = process.env.PAYFAST_PASSPHRASE || "";
    const notifyUrl =
      process.env.PAYFAST_ONCE_NOTIFY_URL ||
      process.env.PAYFAST_NOTIFY_URL ||
      returnUrl;
    const returnUrlResolved =
      process.env.PAYFAST_ONCE_RETURN_URL ||
      process.env.PAYFAST_RETURN_URL ||
      returnUrl;
    const cancelUrlResolved =
      process.env.PAYFAST_ONCE_CANCEL_URL ||
      process.env.PAYFAST_CANCEL_URL ||
      cancelUrl;

    if (!merchantId || !merchantKey) {
      return res.status(500).json({
        error: "Payfast merchant credentials not configured"
      });
    }

    // Load invoice to validate amount and get org/client ids for ITN handling.
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, org_id, client_id, total_amount, invoice_number, currency")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[payfast-once] Failed to load invoice", invoiceError.message);
      return res.status(500).json({ error: "Failed to load invoice" });
    }

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoiceAmount = Number(invoice.total_amount ?? amount);
    const paymentAmount = Number(amount);
    const safeAmount = Number.isFinite(invoiceAmount)
      ? invoiceAmount
      : Number.isFinite(paymentAmount)
        ? paymentAmount
        : 0;

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return res.status(400).json({ error: "Invalid invoice amount" });
    }

    const [firstName, ...restName] = String(clientName || "").trim().split(" ");
    const lastName = restName.join(" ");

    const payload = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrlResolved,
      cancel_url: cancelUrlResolved,
      notify_url: notifyUrl,
      m_payment_id: `invoice-${invoice.id}-${Date.now()}`,
      amount: safeAmount.toFixed(2),
      item_name: `Invoice ${invoice.invoice_number || invoice.id}`,
      item_description: `Payment for invoice ${invoice.invoice_number || invoice.id}`,
      name_first: firstName || "",
      name_last: lastName || "",
      email_address: clientEmail,
      custom_str1: `invoice:${invoice.id}`,
      custom_str2: invoice.client_id || "",
      custom_str3: invoice.org_id || "",
      custom_str4: "once",
      custom_str5: invoice.currency || currency || "ZAR"
    };

    payload.signature = signPayfastPayload(payload, passphrase);

    return res.json({
      payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
      fields: payload
    });
  } catch (err) {
    console.error("[payfast-once] Error", err);
    return res.status(500).json({ error: "Failed to start Payfast payment" });
  }
});

/**
 * PayFast ITN handler for one-time invoice payments.
 * Expects custom_str1 in the format "invoice:<invoiceId>" for one-time payments.
 */
app.post("/api/payfast/itn", async (req, res) => {
  const payload = req.body || {};
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const signatureValid = verifyPayfastSignature(payload, passphrase);

  if (!signatureValid) {
    console.error("[payfast-itn] Invalid signature", {
      m_payment_id: payload.m_payment_id,
      payment_status: payload.payment_status
    });
    return res.status(400).send("Invalid signature");
  }

  const paymentStatus = String(payload.payment_status || "").toUpperCase();
  if (paymentStatus !== "COMPLETE") {
    return res.status(200).send("OK");
  }

  const customStr1 = String(payload.custom_str1 || "");
  if (!customStr1.startsWith("invoice:")) {
    // Not a one-time invoice payment; acknowledge for now.
    console.log("[payfast-itn] Non-invoice ITN received", {
      m_payment_id: payload.m_payment_id,
      payment_status: payload.payment_status
    });
    return res.status(200).send("OK");
  }

  const invoiceId = customStr1.split(":")[1];
  if (!invoiceId) {
    console.error("[payfast-itn] Missing invoice id in custom_str1", customStr1);
    return res.status(200).send("OK");
  }

  const paymentAmountRaw = payload.amount_gross ?? payload.amount;
  const paymentAmount = Number(paymentAmountRaw);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    console.error("[payfast-itn] Invalid payment amount", paymentAmountRaw);
    return res.status(200).send("OK");
  }

  try {
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, org_id, client_id, total_amount, status")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[payfast-itn] Failed to load invoice", invoiceError.message);
      return res.status(200).send("OK");
    }

    if (!invoice) {
      console.error("[payfast-itn] Invoice not found", invoiceId);
      return res.status(200).send("OK");
    }

    const { data: existingPayments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoiceId);

    if (paymentsError) {
      console.error("[payfast-itn] Failed to load existing payments", paymentsError.message);
      return res.status(200).send("OK");
    }

    const alreadyPaid = (existingPayments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    const newTotalPaid = alreadyPaid + paymentAmount;
    const invoiceTotal = Number(invoice.total_amount || 0);

    let newStatus = invoice.status;
    if (invoiceTotal > 0) {
      if (newTotalPaid >= invoiceTotal - 0.01) {
        newStatus = "paid";
      } else if (newTotalPaid > 0 && invoice.status !== "paid") {
        newStatus = "partial_paid";
      }
    }

    const nowIso = new Date().toISOString();
    const reference = String(payload.pf_payment_id || payload.m_payment_id || "");

    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      org_id: invoice.org_id,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      amount: paymentAmount,
      payment_date: nowIso,
      payment_method: "payfast",
      reference_number: reference,
      notes: "PayFast one-time payment"
    });

    if (insertError) {
      console.error("[payfast-itn] Failed to insert payment", insertError.message);
      return res.status(200).send("OK");
    }

    if (newStatus && newStatus !== invoice.status) {
      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("[payfast-itn] Failed to update invoice status", updateError.message);
      }
    }

    console.log("[payfast-itn] Recorded payment for invoice", {
      invoiceId,
      paymentAmount,
      status: newStatus
    });

    return res.status(200).send("OK");
  } catch (err) {
    console.error("[payfast-itn] Unexpected error", err);
    return res.status(200).send("OK");
  }
});

app.post("/api/admin/roles", async (req, res) => {
  try {
    const user = await getAdminFromRequest(req, res);
    if (!user) return;

    const { userId, role } = req.body || {};
    if (!userId || !role) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: ["userId", "role"]
      });
    }

    const normalizedRole = String(role).toLowerCase();
    if (!["admin", "user"].includes(normalizedRole)) {
      return res.status(400).json({
        error: "Invalid role",
        allowed: ["admin", "user"]
      });
    }

    const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { app_metadata: { role: normalizedRole } }
    );

    if (updateError) {
      logAdminApi(req.method, req.path, 500, `updateUserById: ${updateError.message}`);
      return res.status(500).json({ error: updateError.message });
    }

    logAdminApi(req.method, req.path, 200, `role updated: ${userId}`);
    return res.json({
      status: "ok",
      user: data?.user || null
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to update user role"
    });
  }
});

app.post("/api/admin/bootstrap", async (req, res) => {
  try {
    const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      return res.status(503).json({ error: "Admin bootstrap token is not configured" });
    }

    const providedToken = req.headers["x-bootstrap-token"];
    if (!providedToken || providedToken !== bootstrapToken) {
      return res.status(401).json({ error: "Invalid bootstrap token" });
    }

    const { email, password, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: ["email", "password"]
      });
    }

    const normalizedRole = String(role ?? "user").toLowerCase();
    if (!["admin", "user"].includes(normalizedRole)) {
      return res.status(400).json({
        error: "Invalid role",
        allowed: ["admin", "user"]
      });
    }

    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: normalizedRole }
    });

    if (createError) {
      return res.status(500).json({ error: createError.message });
    }

    return res.json({
      status: "ok",
      user: data?.user || null
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({
      error: err?.message || "Failed to bootstrap admin user"
    });
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const users = [];
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (listError) {
        logAdminApi(req.method, req.path, 500, `listUsers: ${listError.message}`);
        return res.status(500).json({ error: listError.message });
      }

      const batch = data?.users || [];
      users.push(...batch.map((u) => ({
        id: u.id,
        email: u.email,
        app_metadata: u.app_metadata || {},
        user_metadata: u.user_metadata || {},
        created_at: u.created_at
      })));

      if (batch.length < perPage) {
        break;
      }

      page += 1;
    }

    return res.json({ users });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to list users"
    });
  }
});

app.delete("/api/admin/users/:userId", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      logAdminApi(req.method, req.path, 500, `deleteUser: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    logAdminApi(req.method, req.path, 200, `user deleted: ${userId}`);
    return res.json({ success: true });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to delete user"
    });
  }
});

app.get("/api/admin/sync-users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const perPage = 200;
    let page = 1;
    const authUsers = [];

    while (true) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (listError) {
        logAdminApi(req.method, req.path, 500, `listUsers: ${listError.message}`);
        return res.status(500).json({ error: listError.message });
      }

      const batch = data?.users || [];
      authUsers.push(...batch);

      if (batch.length < perPage) {
        break;
      }

      page += 1;
    }

    const userIds = authUsers.map((u) => u.id);
    if (userIds.length === 0) {
      logAdminApi(req.method, req.path, 200, "0 users");
      return res.json({ users: [] });
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, avatar_url, logo_url")
      .in("id", userIds);

    if (profilesError) {
      logAdminApi(req.method, req.path, 500, `profiles: ${profilesError.message}`);
      return res.status(500).json({ error: profilesError.message });
    }

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from("memberships")
      .select("user_id, role, org_id")
      .in("user_id", userIds);

    if (membershipsError) {
      logAdminApi(req.method, req.path, 500, `memberships: ${membershipsError.message}`);
      return res.status(500).json({ error: membershipsError.message });
    }

    const orgIds = Array.from(new Set((memberships || []).map((m) => m.org_id).filter(Boolean)));
    const { data: organizations, error: orgsError } = orgIds.length
      ? await supabaseAdmin.from("organizations").select("id, name, owner_id").in("id", orgIds)
      : { data: [], error: null };

    if (orgsError) {
      logAdminApi(req.method, req.path, 500, `organizations: ${orgsError.message}`);
      return res.status(500).json({ error: orgsError.message });
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const orgMap = new Map((organizations || []).map((org) => [org.id, org]));
    const membershipsByUser = (memberships || []).reduce((acc, membership) => {
      const list = acc[membership.user_id] || [];
      list.push({
        ...membership,
        organization: orgMap.get(membership.org_id) || null
      });
      acc[membership.user_id] = list;
      return acc;
    }, {});

    const users = authUsers.map((authUser) => ({
      id: authUser.id,
      email: authUser.email,
      app_metadata: authUser.app_metadata || {},
      user_metadata: authUser.user_metadata || {},
      created_at: authUser.created_at,
      profile: profileMap.get(authUser.id) || null,
      memberships: membershipsByUser[authUser.id] || []
    }));

    logAdminApi(req.method, req.path, 200, `${users.length} users`);
    return res.json({ users });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to sync users"
    });
  }
});

app.get("/api/admin/sync-data", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 1000, 5000);

    const users = [];
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (listError) {
        logAdminApi(req.method, req.path, 500, `listUsers: ${listError.message}`);
        return res.status(500).json({ error: listError.message });
      }

      const batch = data?.users || [];
      users.push(...batch);

      if (batch.length < perPage) {
        break;
      }

      page += 1;
    }

    const userIds = users.map((u) => u.id);

    const { data: profiles, error: profilesError } = userIds.length
      ? await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, avatar_url, logo_url")
        .in("id", userIds)
      : { data: [], error: null };

    if (profilesError) {
      logAdminApi(req.method, req.path, 500, `profiles: ${profilesError.message}`);
      return res.status(500).json({ error: profilesError.message });
    }

    const { data: memberships, error: membershipsError } = userIds.length
      ? await supabaseAdmin
        .from("memberships")
        .select("user_id, role, org_id")
        .in("user_id", userIds)
      : { data: [], error: null };

    if (membershipsError) {
      logAdminApi(req.method, req.path, 500, `memberships: ${membershipsError.message}`);
      return res.status(500).json({ error: membershipsError.message });
    }

    const { data: organizations, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, owner_id")
      .limit(limit);

    if (orgsError) {
      logAdminApi(req.method, req.path, 500, `organizations: ${orgsError.message}`);
      return res.status(500).json({ error: orgsError.message });
    }

    const orgOwnerMap = new Map((organizations || []).map((org) => [org.id, org.owner_id]));

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .limit(limit);

    if (clientsError) {
      logAdminApi(req.method, req.path, 500, `clients: ${clientsError.message}`);
      return res.status(500).json({ error: clientsError.message });
    }

    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select("*")
      .limit(limit);

    if (servicesError) {
      logAdminApi(req.method, req.path, 500, `services: ${servicesError.message}`);
      return res.status(500).json({ error: servicesError.message });
    }

    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .limit(limit);

    if (invoicesError) {
      logAdminApi(req.method, req.path, 500, `invoices: ${invoicesError.message}`);
      return res.status(500).json({ error: invoicesError.message });
    }

    const { data: quotes, error: quotesError } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .limit(limit);

    if (quotesError) {
      logAdminApi(req.method, req.path, 500, `quotes: ${quotesError.message}`);
      return res.status(500).json({ error: quotesError.message });
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .limit(limit);

    if (paymentsError) {
      logAdminApi(req.method, req.path, 500, `payments: ${paymentsError.message}`);
      return res.status(500).json({ error: paymentsError.message });
    }

    const mappedClients = (clients || []).map((client) => ({
      ...client,
      org_owner_id: orgOwnerMap.get(client.org_id) || null,
      user_id: orgOwnerMap.get(client.org_id) || null
    }));

    const mappedServices = (services || []).map((service) => ({
      ...service,
      org_owner_id: orgOwnerMap.get(service.org_id) || null,
      user_id: orgOwnerMap.get(service.org_id) || null
    }));

    const mappedInvoices = (invoices || []).map((invoice) => ({
      ...invoice,
      org_owner_id: orgOwnerMap.get(invoice.org_id) || null,
      user_id: invoice.created_by || orgOwnerMap.get(invoice.org_id) || null
    }));

    const mappedQuotes = (quotes || []).map((quote) => ({
      ...quote,
      org_owner_id: orgOwnerMap.get(quote.org_id) || null,
      user_id: quote.created_by || orgOwnerMap.get(quote.org_id) || null
    }));

    const mappedPayments = (payments || []).map((payment) => ({
      ...payment,
      org_owner_id: orgOwnerMap.get(payment.org_id) || null,
      user_id: orgOwnerMap.get(payment.org_id) || null
    }));

    const orgIds = Array.from(new Set((organizations || []).map((org) => org.id)));
    const assets = [];
    for (const orgId of orgIds.slice(0, 50)) {
      const { data: orgAssets, error: assetsError } = await supabaseAdmin
        .storage
        .from(storageBucket)
        .list(`${orgId}`, { limit: 200 });

      if (assetsError) {
        continue;
      }

      (orgAssets || []).forEach((asset) => {
        assets.push({
          ...asset,
          org_id: orgId
        });
      });
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const orgMap = new Map((organizations || []).map((org) => [org.id, org]));
    const membershipsByUser = (memberships || []).reduce((acc, membership) => {
      const list = acc[membership.user_id] || [];
      list.push({
        ...membership,
        organization: orgMap.get(membership.org_id) || null
      });
      acc[membership.user_id] = list;
      return acc;
    }, {});

    const enrichedUsers = (users || []).map((authUser) => ({
      id: authUser.id,
      email: authUser.email,
      app_metadata: authUser.app_metadata || {},
      user_metadata: authUser.user_metadata || {},
      created_at: authUser.created_at,
      profile: profileMap.get(authUser.id) || null,
      memberships: membershipsByUser[authUser.id] || []
    }));

    const counts = {
      users: enrichedUsers.length,
      organizations: (organizations || []).length,
      clients: mappedClients.length,
      services: mappedServices.length,
      invoices: mappedInvoices.length,
      quotes: mappedQuotes.length,
      payments: mappedPayments.length
    };
    logAdminApi(req.method, req.path, 200, `sync ok: ${counts.users} users, ${counts.invoices} invoices`);
    return res.json({
      users: enrichedUsers,
      organizations: organizations || [],
      memberships: memberships || [],
      clients: mappedClients,
      services: mappedServices,
      invoices: mappedInvoices,
      quotes: mappedQuotes,
      payments: mappedPayments,
      assets,
      bucket: storageBucket
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    const message = err?.message || "Failed to sync admin data";
    logAdminApi(req.method, req.path, 500, message);
    return res.status(500).json({
      error: message
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  const url = `http://localhost:${port}`;
  console.log(`Backend running at ${url}`);
  console.log(`  Health check: ${url}/api/health`);
});