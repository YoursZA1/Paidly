import {
  bearerTokenFromReq,
  getSupabaseAdmin,
  recordPortalPayment,
  verifyPortalToken,
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
  const token = bearerTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const session = verifyPortalToken(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("org_id")
    .eq("id", session.sub)
    .maybeSingle();
  if (!client?.org_id) {
    return res.status(404).json({ error: "Client not found" });
  }

  const body = parseBody(req);
  const pay = await recordPortalPayment(
    supabase,
    client.org_id,
    session.sub,
    body?.invoiceId,
    body?.amount,
    body?.method,
    body?.notes
  );
  if (!pay.ok) {
    return res.status(400).json({ error: pay.error });
  }
  return res.status(200).json({ success: true });
}
