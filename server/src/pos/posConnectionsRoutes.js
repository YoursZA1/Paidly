import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import {
  loadCompanyMembership,
  companyRoleHasPermission,
  PERMISSIONS,
} from "../companyRouteAccess.js";
import { getWebhookPublicUrl } from "./posWebhookAuth.js";
import { decryptPosSecret } from "./posSecretCrypto.js";
import { deleteYocoWebhook } from "./yocoConnect.js";

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function mapPosDbError(message) {
  const msg = String(message || "");
  if (/pos_connections|pos_sales_events|pos_oauth_states/i.test(msg) && /schema cache|does not exist|could not find the table/i.test(msg)) {
    return "POS database tables are missing. Run scripts/apply-pos-integrations.sql in Supabase SQL Editor (see docs/POS_INTEGRATIONS.md).";
  }
  if (/foreign key|violates foreign key|23503/i.test(msg)) {
    return "Could not delete POS connection because related sales data could not be removed. Run supabase/migrations/20260709190000_pos_sales_events_cascade_delete.sql in Supabase SQL Editor.";
  }
  return msg || "Database error";
}

const VALID_PROVIDERS = new Set(["generic", "yoco", "square"]);

function sanitizeConnection(row) {
  if (!row) return null;
  const config = row.config || {};
  return {
    id: row.id,
    org_id: row.org_id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    webhook_token: row.webhook_token,
    webhook_url: getWebhookPublicUrl(row.webhook_token),
    last_event_at: row.last_event_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    config: {
      connection_method: config.connection_method || "manual_webhook",
      auth_type: config.auth_type || "webhook",
      square_merchant_id: config.square_merchant_id || null,
      yoco_mode: config.yoco_mode || null,
      connected_at: config.connected_at || null,
    },
    oauth_connected: config.connection_method === "oauth_connect" || config.auth_type === "oauth",
  };
}

async function requireSettingsManager(req, res) {
  const { user, error: authErr } = await getUserFromRequest(req);
  if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

  const membership = await loadCompanyMembership(supabaseAdmin, user.id);
  if (!membership) {
    return { ok: false, response: jsonError(res, 403, "No company membership") };
  }
  if (!companyRoleHasPermission(membership.companyRole, PERMISSIONS.MANAGE_COMPANY_SETTINGS)) {
    return { ok: false, response: jsonError(res, 403, "Forbidden — company settings permission required") };
  }

  return { ok: true, user, membership };
}

export async function handlePosConnectionsList(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .select("*")
    .eq("org_id", gate.membership.orgId)
    .order("created_at", { ascending: false });

  if (error) return jsonError(res, 500, mapPosDbError(error.message) || "Could not load POS connections");

  return res.status(200).json({
    connections: (data || []).map(sanitizeConnection),
  });
}

export async function handlePosConnectionCreate(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const provider = String(req.body?.provider || "generic").trim().toLowerCase();
  if (!VALID_PROVIDERS.has(provider)) {
    return jsonError(res, 400, "Invalid provider. Use generic, yoco, or square.");
  }

  const label = String(req.body?.label || "").trim() || `${provider.charAt(0).toUpperCase()}${provider.slice(1)} POS`;
  const webhookSecret = crypto.randomBytes(32).toString("hex");
  const webhookToken = crypto.randomBytes(24).toString("hex");

  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .insert({
      org_id: gate.membership.orgId,
      provider,
      label,
      webhook_token: webhookToken,
      webhook_secret: webhookSecret,
      status: "active",
      created_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return jsonError(res, 500, error.message || "Could not create POS connection");

  return res.status(201).json({
    connection: {
      ...sanitizeConnection(data),
      webhook_secret: webhookSecret,
    },
  });
}

export async function handlePosConnectionPatch(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const connectionId = String(req.params?.id || req.body?.id || "").trim();
  if (!connectionId) return jsonError(res, 400, "Missing connection id");

  const updates = {};
  if (req.body?.label != null) updates.label = String(req.body.label).trim() || "POS Connection";
  if (req.body?.status != null) {
    const status = String(req.body.status).trim().toLowerCase();
    if (!["active", "disabled"].includes(status)) {
      return jsonError(res, 400, "status must be active or disabled");
    }
    updates.status = status;
  }
  if (req.body?.rotate_secret === true) {
    updates.webhook_secret = crypto.randomBytes(32).toString("hex");
  }

  if (Object.keys(updates).length === 0) {
    return jsonError(res, 400, "No valid fields to update");
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("pos_connections")
    .update(updates)
    .eq("id", connectionId)
    .eq("org_id", gate.membership.orgId)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(res, 500, error.message || "Could not update POS connection");
  if (!data) return jsonError(res, 404, "Connection not found");

  const response = { connection: sanitizeConnection(data) };
  if (updates.webhook_secret) {
    response.connection.webhook_secret = updates.webhook_secret;
  }

  return res.status(200).json(response);
}

export async function handlePosConnectionDelete(req, res) {
  try {
    const gate = await requireSettingsManager(req, res);
    if (!gate.ok) return gate.response;

    const connectionId = String(
      req.params?.id || req.query?.id || req.body?.id || ""
    ).trim();
    if (!connectionId) return jsonError(res, 400, "Missing connection id");

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("pos_connections")
      .select("id, provider, config")
      .eq("id", connectionId)
      .eq("org_id", gate.membership.orgId)
      .maybeSingle();

    if (loadError) {
      return jsonError(res, 500, mapPosDbError(loadError.message) || "Could not load connection");
    }
    if (!existing) return jsonError(res, 404, "Connection not found");

    if (existing.provider === "yoco" && existing.config?.yoco_webhook_subscription_id) {
      const apiKey = decryptPosSecret(existing.config?.yoco_api_key_enc);
      if (apiKey) {
        await deleteYocoWebhook(apiKey, existing.config.yoco_webhook_subscription_id);
      }
    }

    // Remove dependent sales first (safe even when FK CASCADE is present).
    const { error: salesDeleteError } = await supabaseAdmin
      .from("pos_sales_events")
      .delete()
      .eq("connection_id", connectionId);

    if (salesDeleteError) {
      console.error("[pos-delete] sales cleanup failed", salesDeleteError.message);
      return jsonError(
        res,
        500,
        mapPosDbError(salesDeleteError.message) || "Could not delete POS sales for this connection"
      );
    }

    const { data: deletedRows, error: deleteError } = await supabaseAdmin
      .from("pos_connections")
      .delete()
      .eq("id", connectionId)
      .eq("org_id", gate.membership.orgId)
      .select("id");

    if (deleteError) {
      console.error("[pos-delete] connection delete failed", deleteError.message);
      return jsonError(
        res,
        500,
        mapPosDbError(deleteError.message) || "Could not delete POS connection"
      );
    }

    if (!deletedRows?.length) {
      return jsonError(res, 404, "Connection not found");
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[pos-delete] unexpected failure", err?.message || err);
    return jsonError(res, 500, err?.message || "Could not delete POS connection");
  }
}

async function requireOrgMember(req, res) {
  const { user, error: authErr } = await getUserFromRequest(req);
  if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

  const membership = await loadCompanyMembership(supabaseAdmin, user.id);
  if (!membership) {
    return { ok: false, response: jsonError(res, 403, "No company membership") };
  }

  return { ok: true, user, membership };
}

export async function handlePosSalesList(req, res) {
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;

  const limit = Math.min(Math.max(Number(req.query?.limit) || 10, 1), 50);
  const todayOnly = String(req.query?.today || "").trim() === "1";

  let query = supabaseAdmin
    .from("pos_sales_events")
    .select("id, external_id, provider, total_amount, currency, payment_method, occurred_at, inventory_applied, items, created_at")
    .eq("org_id", gate.membership.orgId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (todayOnly) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    query = query.gte("occurred_at", start.toISOString());
  }

  const { data, error } = await query;
  if (error) return jsonError(res, 500, error.message || "Could not load POS sales");

  const sales = data || [];
  const totalToday = todayOnly
    ? sales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    : null;

  return res.status(200).json({ sales, total_today: totalToday });
}
