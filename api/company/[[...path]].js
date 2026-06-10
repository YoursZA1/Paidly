import {
  handleCompanyTeamInvite,
  handleCompanyTeamRolePatch,
  handleCompanyContextGet,
} from "../../server/src/companyTeamRoutes.js";
import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";

/**
 * Vercel: /api/company/team/invite | /api/company/team/role | /api/company/context
 * Deep paths are rewritten in vercel.json (?__companyOp=…) because nested segments
 * may not reach this catch-all on all Vercel routing configurations.
 */
function resolveCompanyRoute(req) {
  const op = String(req.query?.__companyOp || "").trim();
  if (op === "team-invite" || op === "invite") return "team-invite";
  if (op === "team-role" || op === "role") return "team-role";
  if (op === "context") return "context";

  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const joined = parts.join("/").replace(/^\/+|\/+$/g, "");
  if (joined === "team/invite") return "team-invite";
  if (joined === "team/role") return "team-role";
  if (joined === "context") return "context";

  const urlPath = String(req.url || "").split("?")[0] || "";
  if (urlPath.endsWith("/team/invite")) return "team-invite";
  if (urlPath.endsWith("/team/role")) return "team-role";
  if (urlPath.endsWith("/context")) return "context";

  return null;
}

export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, PATCH, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();

  req.body = normalizeRequestBody(req);

  const route = resolveCompanyRoute(req);
  if (route === "team-invite") {
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
