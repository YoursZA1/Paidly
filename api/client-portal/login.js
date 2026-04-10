import {
  clientRowForResponse,
  findClientsByEmail,
  getSupabaseAdmin,
  isPortalSigningReady,
  signPortalToken,
} from "./shared.js";

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }
  if (!isPortalSigningReady()) {
    return res.status(503).json({ error: "Portal signing not configured" });
  }

  const body = parseBody(req);
  const email = body?.email;
  const { clients, error } = await findClientsByEmail(supabase, email);
  if (error && !clients?.length) {
    return res.status(400).json({ error });
  }
  if (!clients.length) {
    return res.status(404).json({ error: "No client account found for this email" });
  }
  if (clients.length > 1) {
    return res.status(409).json({
      error: "Multiple client records use this email. Contact the business to resolve.",
    });
  }

  const row = clients[0];
  let token;
  try {
    token = signPortalToken(row.id, row.email || email);
  } catch (e) {
    return res.status(503).json({ error: e?.message || "Could not create session" });
  }

  return res.status(200).json({
    client: clientRowForResponse(row),
    token,
  });
}
