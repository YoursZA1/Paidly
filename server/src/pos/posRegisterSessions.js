import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidUuid } from "../inputValidation.js";
import { requirePosPermission } from "./posConnectionsRoutes.js";
import { PERMISSIONS, companyRoleHasPermission } from "../companyRouteAccess.js";
import {
  closeSessionSnapshot,
  parseCloseSessionBody,
  parseOpenSessionBody,
  publicSessionView,
  summarizeSessionCash,
} from "./posRegisterSessionMath.js";

const SESSION_SELECT =
  "id, org_id, register_id, status, opening_balance, cash_sales, cash_refunds, expected_cash, closing_cash, variance, opened_by, closed_by, opened_at, closed_at, notes, created_at, updated_at";

const SESSION_SALES_SELECT = "sale_kind, payment_method, status, total_amount";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

export function isMissingSessionSchema(message) {
  const msg = String(message || "");
  return (
    /pos_register_sessions|session_id/i.test(msg) &&
    /schema cache|does not exist|could not find the/i.test(msg)
  );
}

function mapSessionSchemaError(message) {
  const msg = String(message || "");
  if (isMissingSessionSchema(msg)) {
    return "POS sessions need a database update. Run supabase/migrations/20260828220000_pos_register_sessions.sql in the Supabase SQL Editor.";
  }
  if (/idx_pos_register_sessions_one_open|duplicate key/i.test(msg)) {
    return "This register already has an open shift";
  }
  if (/Completed POS sessions cannot be edited/i.test(msg)) {
    return "Completed POS sessions cannot be edited";
  }
  return msg || "Could not save session";
}

async function loadRegister(orgId, registerId) {
  const { data, error } = await supabaseAdmin
    .from("pos_registers")
    .select("id, org_id, name, status, opening_balance, company_id")
    .eq("id", registerId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadNameMaps(orgId, rows) {
  const registerIds = [...new Set((rows || []).map((row) => row.register_id).filter(Boolean))];
  const userIds = [
    ...new Set(
      (rows || []).flatMap((row) => [row.opened_by, row.closed_by]).filter(Boolean)
    ),
  ];
  const registers = new Map();
  if (registerIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("pos_registers")
      .select("id, name")
      .eq("org_id", orgId)
      .in("id", registerIds);
    if (error) throw error;
    for (const row of data || []) registers.set(row.id, row.name);
  }
  const people = new Map();
  if (userIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (error) throw error;
    for (const row of data || []) {
      people.set(row.id, row.full_name || row.email || "Team member");
    }
  }
  return { registers, people };
}

async function loadSessionSales(sessionId) {
  const { data, error } = await supabaseAdmin
    .from("pos_sales_events")
    .select(SESSION_SALES_SELECT)
    .eq("session_id", sessionId);
  if (error) {
    if (isMissingSessionSchema(error.message)) return [];
    throw error;
  }
  return data || [];
}

async function viewSessions(orgId, rows, { liveOpen = true } = {}) {
  const { registers, people } = await loadNameMaps(orgId, rows);
  const views = [];
  for (const row of rows || []) {
    const extras = {
      register_name: registers.get(row.register_id) || null,
      opened_by_name: row.opened_by ? people.get(row.opened_by) || null : null,
      closed_by_name: row.closed_by ? people.get(row.closed_by) || null : null,
    };
    if (liveOpen && row.status === "open") {
      const sales = await loadSessionSales(row.id);
      Object.assign(extras, summarizeSessionCash(sales, row.opening_balance));
    }
    views.push(publicSessionView(row, extras));
  }
  return views;
}

/**
 * Native till lookup. Missing schema degrades (do not block sales).
 */
export async function resolveOpenSession(orgId, registerId) {
  if (!registerId) return { ok: true, session: null, missingSchema: false };
  const { data, error } = await supabaseAdmin
    .from("pos_register_sessions")
    .select(SESSION_SELECT)
    .eq("org_id", orgId)
    .eq("register_id", registerId)
    .eq("status", "open")
    .maybeSingle();
  if (error) {
    if (isMissingSessionSchema(error.message)) {
      return { ok: true, session: null, missingSchema: true };
    }
    throw error;
  }
  if (!data) {
    return {
      ok: false,
      error: "Start a shift on this register before selling",
      code: "SESSION_REQUIRED",
    };
  }
  return { ok: true, session: data, missingSchema: false };
}

export async function registerHasOpenSession(orgId, registerId) {
  const resolved = await resolveOpenSession(orgId, registerId);
  if (resolved.missingSchema) return { ok: true, open: false, missingSchema: true };
  if (!resolved.ok && resolved.code === "SESSION_REQUIRED") {
    return { ok: true, open: false, missingSchema: false };
  }
  if (!resolved.ok) return resolved;
  return { ok: true, open: Boolean(resolved.session?.id), missingSchema: false };
}

/**
 * GET /api/pos/sessions
 */
export async function handlePosSessionsList(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
  if (!gate.ok) return gate.response;

  const orgId = gate.membership.orgId;
  const registerId = String(req.query?.register_id || "").trim();
  const status = String(req.query?.status || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 100);
  const canReports = companyRoleHasPermission(gate.membership.companyRole, PERMISSIONS.POS_VIEW_REPORTS);

  try {
    let query = supabaseAdmin
      .from("pos_register_sessions")
      .select(SESSION_SELECT)
      .eq("org_id", orgId)
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (registerId) {
      if (!isValidUuid(registerId)) return jsonError(res, 422, "register_id is invalid");
      query = query.eq("register_id", registerId);
    }
    if (status === "open" || status === "closed") {
      if (status === "closed" && !canReports) {
        return jsonError(res, 403, "Forbidden — POS permission required", {
          code: "POS_FORBIDDEN",
          permission: PERMISSIONS.POS_VIEW_REPORTS,
        });
      }
      query = query.eq("status", status);
    } else if (!canReports) {
      query = query.eq("status", "open");
    }

    const { data, error } = await query;
    if (error) return jsonError(res, 500, mapSessionSchemaError(error.message));
    const sessions = await viewSessions(orgId, data || []);
    return res.status(200).json({ sessions });
  } catch (err) {
    return jsonError(res, 500, mapSessionSchemaError(err?.message));
  }
}

/**
 * GET /api/pos/sessions/:id
 */
export async function handlePosSessionGet(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
  if (!gate.ok) return gate.response;

  const id = String(req.params?.id || "").trim();
  if (!isValidUuid(id)) return jsonError(res, 422, "Session id is required");

  const orgId = gate.membership.orgId;
  try {
    const { data, error } = await supabaseAdmin
      .from("pos_register_sessions")
      .select(SESSION_SELECT)
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) return jsonError(res, 500, mapSessionSchemaError(error.message));
    if (!data) return jsonError(res, 404, "Session not found");
    if (
      data.status === "closed" &&
      !companyRoleHasPermission(gate.membership.companyRole, PERMISSIONS.POS_VIEW_REPORTS)
    ) {
      return jsonError(res, 403, "Forbidden — POS permission required", {
        code: "POS_FORBIDDEN",
        permission: PERMISSIONS.POS_VIEW_REPORTS,
      });
    }
    const [session] = await viewSessions(orgId, [data]);
    return res.status(200).json({ session });
  } catch (err) {
    return jsonError(res, 500, mapSessionSchemaError(err?.message));
  }
}

/**
 * POST /api/pos/sessions — open a shift.
 */
export async function handlePosSessionOpen(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_SELL);
  if (!gate.ok) return gate.response;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;

  try {
    const registerId = body.register_id ? String(body.register_id).trim() : "";
    if (!isValidUuid(registerId)) {
      return jsonError(res, 422, "register_id is required", { code: "REGISTER_REQUIRED" });
    }
    const register = await loadRegister(orgId, registerId);
    if (!register) return jsonError(res, 404, "Register not found", { code: "REGISTER_NOT_FOUND" });
    if (register.status !== "active") {
      return jsonError(res, 422, "This register is disabled", { code: "REGISTER_DISABLED" });
    }

    const parsed = parseOpenSessionBody(body, register.opening_balance);
    if (!parsed.ok) return jsonError(res, 422, parsed.error, { code: parsed.code });

    const { data, error } = await supabaseAdmin
      .from("pos_register_sessions")
      .insert({
        org_id: orgId,
        register_id: parsed.register_id,
        status: "open",
        opening_balance: parsed.opening_balance,
        cash_sales: 0,
        cash_refunds: 0,
        expected_cash: parsed.opening_balance,
        opened_by: gate.user.id,
        notes: parsed.notes,
      })
      .select(SESSION_SELECT)
      .single();
    if (error) {
      const status = /duplicate key|idx_pos_register_sessions_one_open/i.test(error.message || "")
        ? 422
        : 500;
      return jsonError(res, status, mapSessionSchemaError(error.message), {
        code: status === 422 ? "SESSION_OPEN" : undefined,
      });
    }

    const [session] = await viewSessions(orgId, [data]);
    return res.status(201).json({ session });
  } catch (err) {
    return jsonError(res, 500, mapSessionSchemaError(err?.message));
  }
}

/**
 * POST /api/pos/sessions/:id/close — snapshot cash and freeze the row.
 */
export async function handlePosSessionClose(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_CLOSE_REGISTER);
  if (!gate.ok) return gate.response;

  const id = String(req.params?.id || "").trim();
  if (!isValidUuid(id)) return jsonError(res, 422, "Session id is required");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const parsed = parseCloseSessionBody(body);
  if (!parsed.ok) return jsonError(res, 422, parsed.error, { code: parsed.code });

  const orgId = gate.membership.orgId;
  try {
    const { data: row, error: loadError } = await supabaseAdmin
      .from("pos_register_sessions")
      .select(SESSION_SELECT)
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (loadError) return jsonError(res, 500, mapSessionSchemaError(loadError.message));
    if (!row) return jsonError(res, 404, "Session not found");
    if (row.status === "closed") {
      return jsonError(res, 422, "Completed POS sessions cannot be edited", { code: "SESSION_CLOSED" });
    }

    const sales = await loadSessionSales(row.id);
    const snapshot = closeSessionSnapshot({
      opening_balance: row.opening_balance,
      sales,
      closing_cash: parsed.closing_cash,
    });
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("pos_register_sessions")
      .update({
        status: "closed",
        cash_sales: snapshot.cash_sales,
        cash_refunds: snapshot.cash_refunds,
        expected_cash: snapshot.expected_cash,
        closing_cash: snapshot.closing_cash,
        variance: snapshot.variance,
        closed_by: gate.user.id,
        closed_at: now,
        notes: parsed.notes != null ? parsed.notes : row.notes,
        updated_at: now,
      })
      .eq("id", id)
      .eq("org_id", orgId)
      .eq("status", "open")
      .select(SESSION_SELECT)
      .maybeSingle();
    if (error) return jsonError(res, 500, mapSessionSchemaError(error.message));
    if (!data) {
      return jsonError(res, 422, "Completed POS sessions cannot be edited", { code: "SESSION_CLOSED" });
    }

    const [session] = await viewSessions(orgId, [data], { liveOpen: false });
    return res.status(200).json({ session });
  } catch (err) {
    return jsonError(res, 500, mapSessionSchemaError(err?.message));
  }
}
