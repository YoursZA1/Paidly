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
import { handleWorkforceEmployees } from "../../server/src/workforce/workforceRoutes.js";

/**
 * Vercel: /api/company/invite | /api/company/role | /api/company/context
 * (Legacy /api/company/team/* rewritten in vercel.json — nested paths do not reach this handler.)
 */
function resolveCompanyRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = parts[0] || "";
  if (head === "invites") {
    if (parts.length === 1) return { route: "invites-list", parts };
    if (parts[2] === "resend") return { route: "invite-resend", parts };
    if (parts[1]) return { route: "invite-revoke", parts };
    return { route: "invites-list", parts };
  }
  if (head === "invite") {
    const sub = parts[1] || "";
    if (sub === "validate") return { route: "invite-validate", parts };
    return { route: "team-invite", parts };
  }
  if (head === "role") return { route: "team-role", parts };
  if (head === "context") return { route: "context", parts };

  const joined = parts.join("/").replace(/^\/+|\/+$/g, "");
  if (joined === "invites") return { route: "invites-list", parts };
  if (/^invites\/[^/]+\/resend$/.test(joined)) return { route: "invite-resend", parts };
  if (/^invites\/[^/]+$/.test(joined)) return { route: "invite-revoke", parts };
  if (joined === "invite/validate") return { route: "invite-validate", parts };
  if (joined === "team/invite" || joined === "invite") return { route: "team-invite", parts };
  if (joined === "team/role" || joined === "role") return { route: "team-role", parts };
  if (joined === "context") return { route: "context", parts };

  const urlPath = String(req.url || "").split("?")[0] || "";
  if (urlPath.endsWith("/invite/validate")) return { route: "invite-validate", parts };
  if (urlPath.endsWith("/invites") && req.method === "GET") return { route: "invites-list", parts };
  if (/\/invites\/[^/]+\/resend$/i.test(urlPath)) return { route: "invite-resend", parts };
  if (/\/invites\/[^/]+$/i.test(urlPath) && req.method === "DELETE") {
    return { route: "invite-revoke", parts };
  }
  if (urlPath.endsWith("/invite")) return { route: "team-invite", parts };
  if (urlPath.endsWith("/role")) return { route: "team-role", parts };
  if (urlPath.endsWith("/context")) return { route: "context", parts };

  return null;
}

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
  if (pathHead === "employees") {
    return handleWorkforceEmployees(req, res);
  }

  const resolved = resolveCompanyRoute(req);
  if (!resolved) return res.status(404).json({ error: "Not found" });

  const { route, parts } = resolved;
  const urlPath = String(req.url || "").split("?")[0] || "";
  const inviteIdMatch = urlPath.match(/\/invites\/([^/]+)/i);
  const inviteId = parts?.[1] || inviteIdMatch?.[1] || null;
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
