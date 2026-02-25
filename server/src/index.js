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

app.post("/api/payfast/itn", (req, res) => {
  const payload = req.body || {};
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  const signatureValid = verifyPayfastSignature(payload, passphrase);

  if (!signatureValid) {
    return res.status(400).send("Invalid signature");
  }

  // TODO: Validate payload with Payfast and update subscription status in storage.
  console.log("Payfast ITN received", {
    m_payment_id: payload.m_payment_id,
    payment_status: payload.payment_status,
    subscription_id: payload.custom_str1,
    gross: payload.amount_gross
  });

  return res.status(200).send("OK");
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
