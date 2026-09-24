import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeRequestBody } from "../validateBody.js";
import { processPosWebhookSale } from "./posSaleProcessor.js";
import { verifyYocoStandardWebhook } from "./yocoConnect.js";
import {
  verifySquareWebhookSignature,
  extractSquareMerchantId,
  getSquareAppWebhookUrl,
} from "./squareOAuth.js";

function getRawBodyString(req, body) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof body === "string") return body;
  return JSON.stringify(body ?? {});
}

/**
 * Public webhook ingress — per-connection token or Square app-level provider route.
 */
export async function handlePosWebhook(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const providerRoute = String(req.params?.provider || req.query?.provider || "").trim().toLowerCase();
  if (providerRoute === "square") {
    return handleSquareProviderWebhook(req, res);
  }

  const webhookToken = String(
    req.params?.token || req.query?.token || req.query?.path?.[1] || ""
  ).trim();

  if (!webhookToken) {
    return res.status(400).json({ error: "Missing webhook token" });
  }

  const { data: connection, error: connError } = await supabaseAdmin
    .from("pos_connections")
    .select("id, org_id, provider, status, webhook_secret, config")
    .eq("webhook_token", webhookToken)
    .maybeSingle();

  if (connError) {
    console.error("[pos-webhook] connection lookup failed", connError.message);
    return res.status(500).json({ error: "Server error" });
  }

  if (!connection) {
    return res.status(404).json({ error: "Unknown webhook" });
  }

  if (connection.status !== "active") {
    return res.status(403).json({ error: "Connection disabled" });
  }

  const body = normalizeRequestBody(req);
  const rawBody = getRawBodyString(req, body);
  const headers = req.headers || {};

  // A sale counts as money received only on evidence the merchant cannot produce: Yoco's own
  // signature, with the secret Yoco issued when Paidly registered the webhook (Yoco connect).
  // Manual / generic connections were signed with a secret handed to the merchant, so anyone with
  // settings access could "sell" any amount. Square arrives on the app-level route below.
  if (!isProviderSignedConnection(connection) || !(headers["webhook-signature"] || headers["webhook_signature"])) {
    return res.status(403).json({
      error: "Only provider-signed POS sales are accepted. Connect Yoco or Square through their connect flow.",
      code: "EXTERNAL_SALE_UNVERIFIED",
    });
  }

  // verifyYocoStandardWebhook treats an empty secret as "no check"; never accept that here.
  const secret = String(connection.webhook_secret || "").trim();
  if (!secret || !verifyYocoStandardWebhook(rawBody, headers, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  return ingestPosSale(res, connection, body);
}

/**
 * Connections whose webhook secret came from the provider and was never shown to the merchant.
 * @param {{ provider?: string, config?: object | null }} connection
 */
export function isProviderSignedConnection(connection) {
  return connection?.provider === "yoco" && connection?.config?.connection_method === "oauth_connect";
}

async function handleSquareProviderWebhook(req, res) {
  const body = normalizeRequestBody(req);
  const rawBody = getRawBodyString(req, body);

  const signature = req.headers?.["x-square-hmacsha256-signature"];
  if (!verifySquareWebhookSignature(rawBody, signature, getSquareAppWebhookUrl())) {
    return res.status(401).json({ error: "Invalid Square webhook signature" });
  }

  const merchantId = extractSquareMerchantId(body);
  if (!merchantId) {
    return res.status(422).json({ error: "Missing merchant_id in Square webhook" });
  }

  const { data: connections, error } = await supabaseAdmin
    .from("pos_connections")
    .select("id, org_id, provider, status, webhook_secret, config")
    .eq("provider", "square")
    .eq("status", "active");

  if (error) {
    console.error("[pos-webhook] square connection lookup failed", error.message);
    return res.status(500).json({ error: "Server error" });
  }

  const connection = (connections || []).find(
    (row) => String(row.config?.square_merchant_id || "") === String(merchantId)
  );

  if (!connection) {
    return res.status(404).json({ error: "No Square connection for merchant" });
  }

  return ingestPosSale(res, connection, body);
}

async function ingestPosSale(res, connection, payload) {
  try {
    const result = await processPosWebhookSale(supabaseAdmin, { connection, payload });

    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error || "Could not process sale" });
    }

    return res.status(result.status || 200).json({
      ok: true,
      duplicate: !!result.duplicate,
      sale_event_id: result.saleEventId || null,
      inventory_applied: !!result.inventoryApplied,
    });
  } catch (err) {
    console.error("[pos-webhook] processing failed", err?.message || err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
