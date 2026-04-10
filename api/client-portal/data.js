import {
  bearerTokenFromReq,
  clientRowForResponse,
  getSupabaseAdmin,
  loadPortalDocuments,
  verifyPortalToken,
} from "./shared.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }
  const token = bearerTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const session = verifyPortalToken(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const { error, client, invoices, quotes } = await loadPortalDocuments(supabase, session.sub, session.email);
  if (error) {
    const status = error === "Session mismatch" ? 403 : 404;
    return res.status(status).json({ error });
  }
  return res.status(200).json({
    client: clientRowForResponse(client),
    invoices,
    quotes,
  });
}
