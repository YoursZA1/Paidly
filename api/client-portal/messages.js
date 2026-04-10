import {
  bearerTokenFromReq,
  getSupabaseAdmin,
  insertPortalMessage,
  listPortalMessages,
  markPortalMessagesRead,
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

async function requireSession(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: "Server misconfigured" });
    return null;
  }
  const token = bearerTokenFromReq(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const session = verifyPortalToken(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  return { supabase, session };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ctx = await requireSession(req, res);
  if (!ctx) return;
  const { supabase, session } = ctx;

  const { data: client } = await supabase
    .from("clients")
    .select("org_id")
    .eq("id", session.sub)
    .maybeSingle();
  if (!client?.org_id) {
    return res.status(404).json({ error: "Client not found" });
  }

  if (req.method === "GET") {
    const { messages, error, missingTable } = await listPortalMessages(supabase, client.org_id, session.sub);
    if (error) {
      return res.status(500).json({ error });
    }
    if (missingTable) {
      return res.status(200).json({ messages: [] });
    }
    const unreadIds = messages.filter((m) => !m.is_read && m.sender_type === "business").map((m) => m.id);
    if (unreadIds.length > 0) {
      await markPortalMessagesRead(supabase, client.org_id, session.sub, unreadIds);
    }
    const readSet = new Set(unreadIds);
    const out = messages.map((m) => (readSet.has(m.id) ? { ...m, is_read: true } : m));
    return res.status(200).json({ messages: out });
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const out = await insertPortalMessage(supabase, client.org_id, session.sub, {
      content: body?.content,
      attachments: body?.attachments,
    });
    if (!out.ok) {
      return res.status(out.error?.includes("not enabled") ? 503 : 400).json({ error: out.error });
    }
    return res.status(200).json({ success: true, id: out.id });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
