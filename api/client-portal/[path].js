/**
 * Single Vercel function for /api/client-portal/* (Hobby plan).
 */
import {
  bearerTokenFromReq,
  clientRowForResponse,
  findClientsByEmail,
  getSupabaseAdmin,
  insertPortalMessage,
  isPortalSigningReady,
  listPortalMessages,
  loadPortalDocuments,
  markPortalMessagesRead,
  patchPortalClient,
  recordPortalPayment,
  signPortalToken,
  verifyPortalToken,
} from "./_shared.js";

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

function portalPathFromReq(req) {
  const p = req.query?.path;
  if (p == null) return "";
  return Array.isArray(p) ? String(p[0] || "") : String(p);
}

async function handleLogin(req, res) {
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

async function handleData(req, res) {
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

async function handleClientPatch(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
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
  const result = await patchPortalClient(supabase, client.org_id, session.sub, body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(200).json({ client: clientRowForResponse(result.client) });
}

async function handlePayment(req, res) {
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

async function handleMessages(req, res) {
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

export default async function handler(req, res) {
  const path = portalPathFromReq(req).replace(/^\/+|\/+$/g, "");
  const actions = {
    login: handleLogin,
    data: handleData,
    client: handleClientPatch,
    payment: handlePayment,
    messages: handleMessages,
  };
  const fn = actions[path];
  if (!fn) {
    return res.status(404).json({ error: "Not found" });
  }
  return fn(req, res);
}
