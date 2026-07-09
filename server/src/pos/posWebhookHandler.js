import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeRequestBody } from "../validateBody.js";
import { verifyPosHmacSignature } from "./posWebhookAuth.js";
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

  let verified = false;
  if (connection.provider === "yoco" && (headers["webhook-signature"] || headers["webhook_signature"])) {
    verified = verifyYocoStandardWebhook(rawBody, headers, connection.webhook_secret);
  } else {
    verified = verifyPosHmacSignature(req, rawBody, connection.webhook_secret);
  }

  if (!verified) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  return ingestPosSale(res, connection, body);
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
