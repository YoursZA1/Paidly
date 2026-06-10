import {
  handleCompanyTeamInvite,
  handleCompanyTeamRolePatch,
  handleCompanyContextGet,
} from "../../server/src/companyTeamRoutes.js";
import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";

/**
 * Vercel: /api/company/invite | /api/company/role | /api/company/context
 * (Legacy /api/company/team/* rewritten in vercel.json — nested paths do not reach this handler.)
 */
function resolveCompanyRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = parts[0] || "";
  if (head === "invite") return "team-invite";
  if (head === "role") return "team-role";
  if (head === "context") return "context";

  const joined = parts.join("/").replace(/^\/+|\/+$/g, "");
  if (joined === "team/invite" || joined === "invite") return "team-invite";
  if (joined === "team/role" || joined === "role") return "team-role";
  if (joined === "context") return "context";

  const urlPath = String(req.url || "").split("?")[0] || "";
  if (urlPath.endsWith("/invite")) return "team-invite";
  if (urlPath.endsWith("/role")) return "team-role";
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
