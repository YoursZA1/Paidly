import { normalizeRequestBody } from "../validateBody.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { loadCompanyMembership } from "../companyRouteAccess.js";
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { canMutateClientTimeline } from "../../../shared/clients/clientRelationshipTimeline.js";
import { getClientRelationshipTimeline } from "./clientTimelineService.js";
import {
  archiveClientNote,
  createClientNote,
  createManualRelationshipEvent,
  updateClientNote,
} from "./clientNotesService.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

async function requireClientTimelineAccess(req, res, { mutate = false } = {}) {
  const { user, error: authErr } = await getUserFromRequest(req);
  if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };
  try {
    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) return { ok: false, response: jsonError(res, 403, "No company membership") };
    if (isPosOnlyStaff(membership)) {
      return { ok: false, response: jsonError(res, 403, "POS staff cannot access client timeline", { code: "POS_SCOPE" }) };
    }
    if (mutate && !canMutateClientTimeline({ ...membership, isOrgOwner: membership.membershipRole === "owner" })) {
      return { ok: false, response: jsonError(res, 403, "Forbidden", { code: "FORBIDDEN" }) };
    }
    return {
      ok: true,
      user,
      membership: { ...membership, isOrgOwner: membership.membershipRole === "owner" },
    };
  } catch (err) {
    return { ok: false, response: jsonError(res, 500, err?.message || "Could not verify access") };
  }
}

function handleServiceError(res, err) {
  const status = Number(err?.status) || 500;
  return jsonError(res, status, err?.message || "Request failed", err?.code ? { code: err.code } : {});
}

export async function handleClientTimeline(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const gate = await requireClientTimelineAccess(req, res);
  if (!gate.ok) return gate.response;
  const clientId = parseUuid(req.query?.client_id || req.query?.id);
  if (!clientId) return jsonError(res, 422, "client_id is required");
  try {
    const data = await getClientRelationshipTimeline(gate.membership.orgId, clientId, gate.membership, req.query || {});
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export async function handleClientNotes(req, res) {
  const body = normalizeRequestBody(req);
  const gate = await requireClientTimelineAccess(req, res, { mutate: true });
  if (!gate.ok) return gate.response;

  try {
    if (req.method === "POST") {
      const clientId = parseUuid(body.client_id || body.clientId || req.query?.client_id);
      if (!clientId) return jsonError(res, 422, "client_id is required");
      const note = await createClientNote(gate.membership.orgId, clientId, gate.user.id, body.body || body.note);
      return res.status(201).json({ ok: true, data: note });
    }
    if (req.method === "PATCH" || req.method === "PUT") {
      const noteId = parseUuid(body.id || req.query?.id);
      if (!noteId) return jsonError(res, 422, "Note id is required");
      const note = await updateClientNote(gate.membership.orgId, noteId, gate.user.id, body.body || body.note);
      return res.status(200).json({ ok: true, data: note });
    }
    if (req.method === "DELETE") {
      const noteId = parseUuid(body.id || req.query?.id);
      if (!noteId) return jsonError(res, 422, "Note id is required");
      const note = await archiveClientNote(gate.membership.orgId, noteId, gate.user.id);
      return res.status(200).json({ ok: true, data: note });
    }
  } catch (err) {
    return handleServiceError(res, err);
  }

  res.setHeader("Allow", "POST, PATCH, PUT, DELETE, OPTIONS");
  return jsonError(res, 405, "Method not allowed");
}

export async function handleClientRelationshipEvents(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const gate = await requireClientTimelineAccess(req, res, { mutate: true });
  if (!gate.ok) return gate.response;
  const body = normalizeRequestBody(req);
  const clientId = parseUuid(body.client_id || body.clientId || req.query?.client_id);
  if (!clientId) return jsonError(res, 422, "client_id is required");
  try {
    const event = await createManualRelationshipEvent(gate.membership.orgId, clientId, gate.user.id, body);
    return res.status(201).json({ ok: true, data: event });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

export function resolveClientTimelineRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = parts[0] || "";
  if (head === "timeline") return { route: "timeline" };
  if (head === "client-notes") return { route: "client-notes" };
  if (head === "client-events") return { route: "client-events" };
  const urlPath = String(req.url || "").split("?")[0] || "";
  if (/\/timeline\/?$/i.test(urlPath) && !/document-timeline/i.test(urlPath)) return { route: "timeline" };
  if (/\/client-notes\/?$/i.test(urlPath)) return { route: "client-notes" };
  if (/\/client-events\/?$/i.test(urlPath)) return { route: "client-events" };
  return null;
}

export async function handleClientTimelineRoute(req, res, resolved) {
  const route = resolved?.route;
  if (route === "timeline") return handleClientTimeline(req, res);
  if (route === "client-notes") return handleClientNotes(req, res);
  if (route === "client-events") return handleClientRelationshipEvents(req, res);
  return jsonError(res, 404, "Not found");
}
