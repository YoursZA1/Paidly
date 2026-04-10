/**
 * Client portal HTTP routes — same behavior as Vercel `/api/client-portal/*`.
 * Supabase (service role) is source of truth; portal session is a signed bearer token.
 */
import express from "express";
import {
  bearerTokenFromReq,
  clientRowForResponse,
  findClientsByEmail,
  getSupabaseAdmin,
  insertPortalMessage,
  listPortalMessages,
  loadPortalDocuments,
  markPortalMessagesRead,
  isPortalSigningReady,
  patchPortalClient,
  recordPortalPayment,
  signPortalToken,
  verifyPortalToken,
} from "../../api/client-portal/_shared.js";

const router = express.Router();

function requirePortalSession(req, res) {
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
  return { supabase, session, token };
}

router.post("/login", async (req, res) => {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }
  if (!isPortalSigningReady()) {
    return res.status(503).json({ error: "Portal signing not configured (CLIENT_PORTAL_JWT_SECRET or service role)" });
  }

  const email = req.body?.email;
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
});

router.get("/data", async (req, res) => {
  const ctx = requirePortalSession(req, res);
  if (!ctx) return;
  const { supabase, session } = ctx;
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
});

router.patch("/client", async (req, res) => {
  const ctx = requirePortalSession(req, res);
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
  const result = await patchPortalClient(supabase, client.org_id, session.sub, req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(200).json({ client: clientRowForResponse(result.client) });
});

router.post("/payment", async (req, res) => {
  const ctx = requirePortalSession(req, res);
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
  const invoiceId = req.body?.invoiceId;
  const amount = req.body?.amount;
  const method = req.body?.method;
  const notes = req.body?.notes;
  const pay = await recordPortalPayment(supabase, client.org_id, session.sub, invoiceId, amount, method, notes);
  if (!pay.ok) {
    return res.status(400).json({ error: pay.error });
  }
  return res.status(200).json({ success: true });
});

router.get("/messages", async (req, res) => {
  const ctx = requirePortalSession(req, res);
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
});

router.post("/messages", async (req, res) => {
  const ctx = requirePortalSession(req, res);
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
  const content = req.body?.content;
  const attachments = req.body?.attachments;
  const out = await insertPortalMessage(supabase, client.org_id, session.sub, { content, attachments });
  if (!out.ok) {
    return res.status(out.error?.includes("not enabled") ? 503 : 400).json({ error: out.error });
  }
  return res.status(200).json({ success: true, id: out.id });
});

export function registerClientPortalRoutes(app) {
  app.use("/api/client-portal", router);
}
