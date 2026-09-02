import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import { handleLeaveRoute, resolveLeaveRoute } from "../../server/src/leave/leaveRoutes.js";

export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();
  req.body = normalizeRequestBody(req);
  const resolved = resolveLeaveRoute(req);
  if (!resolved) return res.status(404).json({ error: "Not found" });
  return handleLeaveRoute(req, res, resolved);
}
