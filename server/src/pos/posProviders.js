/**
 * GET  /api/pos/providers  — POS payment provider options with their real status for this business.
 * POST /api/pos/providers  — { action: "request_custom" | "archive_custom" } for providers without an adapter.
 *
 * Status is derived from real state only:
 *   yoco / square → an active pos_connections row for this business
 *   platform      → the Payment Engine can actually charge through that online provider here
 *   paidly_pay    → the card-terminal rail is enabled
 *   custom        → always "requested", never connected
 * No credentials or secrets are returned.
 */
import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidUuid } from "../inputValidation.js";
import { describeOnlineProvider } from "../payments/paymentProviders.js";
import { cardTerminalRailEnabled } from "../../../shared/payments/paidlyPayContract.js";
import { CUSTOM_PROVIDER_METHODS, POS_PROVIDER_NOT_SUPPORTED, POS_PROVIDER_OPTIONS } from "../../../shared/pos/posProviderCatalog.js";
import { POS_ACCESS_MIGRATION } from "./posAccessCodes.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function clean(value, max) {
  const text = String(value ?? "").trim().slice(0, max);
  return text || null;
}

async function loadConnections(orgId) {
  const { data, error } = await supabaseAdmin.from("pos_connections").select("id, provider, label, status, last_event_at").eq("org_id", orgId);
  if (error) return [];
  return data || [];
}

async function loadCustom(orgId) {
  const { data, error } = await supabaseAdmin
    .from("pos_custom_providers")
    .select("id, provider_name, display_name, method, website, contact, notes, status, created_at")
    .eq("org_id", orgId)
    .eq("status", "requested")
    .order("created_at", { ascending: false });
  if (error) return { rows: [], missing: /pos_custom_providers/i.test(error.message || "") };
  return { rows: data || [], missing: false };
}

/** Pure: status per option from real state. Exported for tests. */
export function providerStatuses({ connections = [], onlineProviderId = null, terminalRailEnabled = false } = {}) {
  return POS_PROVIDER_OPTIONS.map((option) => {
    if (option.connect === "yoco_key" || option.connect === "square_oauth") {
      const rows = connections.filter((c) => c.provider === option.id);
      const active = rows.find((c) => c.status === "active");
      return {
        ...option,
        status: active ? "connected" : rows.length ? "disabled" : "not_connected",
        connection_id: active?.id || rows[0]?.id || null,
        last_event_at: active?.last_event_at || null,
      };
    }
    if (option.connect === "platform") {
      return { ...option, status: onlineProviderId === option.id ? "available" : "unavailable" };
    }
    return { ...option, status: terminalRailEnabled ? "available" : "coming_soon" };
  });
}

export async function handlePosProvidersGet(req, res, gate) {
  try {
    const orgId = gate.membership.orgId;
    const [connections, custom] = await Promise.all([loadConnections(orgId), loadCustom(orgId)]);
    const online = describeOnlineProvider({ sourceKind: "pos" });
    return res.status(200).json({
      ok: true,
      providers: providerStatuses({ connections, onlineProviderId: online?.id || null, terminalRailEnabled: cardTerminalRailEnabled() }),
      custom: custom.rows.map((row) => ({ ...row, status: "requested", connected: false })),
      custom_unavailable: custom.missing,
      not_supported: POS_PROVIDER_NOT_SUPPORTED,
      methods: CUSTOM_PROVIDER_METHODS,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load payment providers");
  }
}

export async function handlePosProvidersPost(req, res, gate) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;
  try {
    if (body.action === "request_custom") {
      const providerName = clean(body.provider_name, 80);
      if (!providerName) return jsonError(res, 422, "Provider name is required", { code: "PROVIDER_NAME_REQUIRED" });
      const method = CUSTOM_PROVIDER_METHODS.some((m) => m.id === body.method) ? body.method : "other";
      const website = clean(body.website, 200);
      if (website && !/^https?:\/\//i.test(website)) return jsonError(res, 422, "Website must start with http:// or https://", { code: "PROVIDER_WEBSITE_INVALID" });
      const { data, error } = await supabaseAdmin
        .from("pos_custom_providers")
        .insert({
          org_id: orgId,
          provider_name: providerName,
          display_name: clean(body.display_name, 80),
          method,
          website,
          contact: clean(body.contact, 200),
          notes: clean(body.notes, 1000),
          created_by: gate.user?.id || null,
        })
        .select("id, provider_name, display_name, method, website, contact, notes, status, created_at")
        .single();
      if (error) {
        if (/pos_custom_providers/i.test(error.message || "")) {
          return jsonError(res, 503, `Custom providers need a database update. Run ${POS_ACCESS_MIGRATION}.`, { code: "POS_ACCESS_SCHEMA" });
        }
        throw error;
      }
      return res.status(201).json({ ok: true, custom: { ...data, status: "requested", connected: false } });
    }
    if (body.action === "archive_custom") {
      if (!isValidUuid(body.id)) return jsonError(res, 422, "id is required");
      const { error } = await supabaseAdmin
        .from("pos_custom_providers")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("id", body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return jsonError(res, 422, "Unknown action", { code: "UNKNOWN_ACTION" });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not save the provider");
  }
}
