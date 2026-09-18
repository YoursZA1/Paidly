import {
  handleCompanyTeamInvite,
  handleCompanyTeamRolePatch,
  handleCompanyContextGet,
  handleCompanyInviteValidate,
  handleCompanyInvitesList,
  handleCompanyInviteRevoke,
  handleCompanyInviteResend,
} from "../../server/src/companyTeamRoutes.js";
import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import { handlePayrollRoute, resolvePayrollRoute } from "../../server/src/payroll/payrollRoutes.js";
import { handleLeaveRoute, resolveLeaveRoute } from "../../server/src/leave/leaveRoutes.js";
import { handleWorkforceEmployees, resolveWorkforceRoute } from "../../server/src/workforce/workforceRoutes.js";
import { handleClientTimelineRoute, resolveClientTimelineRoute } from "../../server/src/clients/clientTimelineRoutes.js";
import { resolveCompanyRoute } from "../../server/src/company/companyVercelRoute.js";

/**
 * Vercel: /api/company/invite | /api/company/role | /api/company/context
 * Nested invite resend/revoke/validate URLs are rewritten in vercel.json onto
 * one-segment aliases (Hobby only matches one extra catch-all segment).
 */

export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();

  req.body = normalizeRequestBody(req);

  const rawPath = req.query?.path;
  const pathHead = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  if (pathHead === "payroll" || req.query?.__payroll) {
    const resolvedPayroll = resolvePayrollRoute(req);
    if (!resolvedPayroll) return res.status(404).json({ error: "Not found" });
    return handlePayrollRoute(req, res, resolvedPayroll);
  }
  if (pathHead === "leave" || req.query?.__leave) {
    const resolvedLeave = resolveLeaveRoute(req);
    if (!resolvedLeave) return res.status(404).json({ error: "Not found" });
    return handleLeaveRoute(req, res, resolvedLeave);
  }
  if (
    pathHead === "employees" ||
    pathHead === "workforce-summary" ||
    pathHead === "workforce-organogram" ||
    pathHead === "workforce-people-calendar" ||
    resolveWorkforceRoute(req)
  ) {
    return handleWorkforceEmployees(req, res);
  }
  const timelineResolved = resolveClientTimelineRoute(req);
  if (pathHead === "timeline" || pathHead === "client-notes" || pathHead === "client-events" || timelineResolved) {
    return handleClientTimelineRoute(req, res, timelineResolved || { route: pathHead });
  }

  const resolved = resolveCompanyRoute(req);
  if (!resolved) return res.status(404).json({ error: "Not found" });

  const { route, parts, id: resolvedId } = resolved;
  const urlPath = String(req.url || "").split("?")[0] || "";
  const inviteIdMatch = urlPath.match(/\/invites\/([^/]+)/i);
  const inviteId = resolvedId || parts?.[1] || inviteIdMatch?.[1] || req.query?.id || null;
  if (inviteId) req.params = { ...(req.params || {}), id: inviteId };

  if (route === "invite-validate") {
    return handleCompanyInviteValidate(req, res);
  }
  if (route === "invites-list") {
    return handleCompanyInvitesList(req, res);
  }
  if (route === "invite-revoke") {
    return handleCompanyInviteRevoke(req, res);
  }
  if (route === "invite-resend") {
    return handleCompanyInviteResend(req, res);
  }
  if (route === "team-invite") {
    const { requireActiveBilling, resolveEntitlement } = await import(
      "../../server/src/billing/entitlements.js"
    );
    const { getBillingSupabaseAdmin } = await import("../../server/src/billing/supabaseAdmin.js");
    const { requireBearerUser } = await import("../../server/src/billing/httpAuth.js");
    const okBilling = await requireActiveBilling(req, res);
    if (!okBilling) return;
    const supabase = getBillingSupabaseAdmin();
    const auth = await requireBearerUser(req, supabase);
    if (!auth.error && supabase) {
      const ent = req.__paidlyEntitlement || (await resolveEntitlement(supabase, auth.user.id));
      if (ent?.seats != null && Number.isFinite(Number(ent.seats))) {
        const companyId = ent.companyId;
        if (companyId) {
          const { count } = await supabase
            .from("memberships")
            .select("id", { count: "exact", head: true })
            .eq("org_id", companyId);
          if (count != null && count >= Number(ent.seats)) {
            return res.status(409).json({
              error: "Seat limit reached for your plan",
              code: "SEAT_LIMIT_REACHED",
              seats: ent.seats,
            });
          }
        }
      }
    }
    return handleCompanyTeamInvite(req, res);
  }
  if (route === "team-role") {
    return handleCompanyTeamRolePatch(req, res);
  }
  if (route === "context") {
    return handleCompanyContextGet(req, res);
  }

  return res.status(404).json({ error: "Not found" });
}
