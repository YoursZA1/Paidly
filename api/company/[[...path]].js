import {
  handleCompanyTeamInvite,
  handleCompanyTeamRolePatch,
  handleCompanyContextGet,
} from "../../server/src/companyTeamRoutes.js";
import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";

/**
 * Vercel: /api/company/team/invite | /api/company/team/role | /api/company/context
 */
export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, PATCH, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();

  req.body = normalizeRequestBody(req);

  const path = String(req.url || "").split("?")[0] || "";
  if (path.endsWith("/team/invite")) {
    return handleCompanyTeamInvite(req, res);
  }
  if (path.endsWith("/team/role")) {
    return handleCompanyTeamRolePatch(req, res);
  }
  if (path.endsWith("/context") || path.endsWith("/company/context")) {
    return handleCompanyContextGet(req, res);
  }

  return res.status(404).json({ error: "Not found" });
}
