import crypto from "node:crypto";
import { encryptPosSecret } from "./posSecretCrypto.js";
import { getWebhookPublicUrl } from "./posWebhookAuth.js";

const YOCO_API_BASE = "https://payments.yoco.com/api";

function normalizeYocoSecretKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!/^sk_(test|live)_/i.test(key)) {
    throw new Error("Yoco secret key must start with sk_test_ or sk_live_");
  }
  return key;
}

/**
 * Validate API key by listing webhooks.
 * @param {string} apiKey
 */
export async function validateYocoApiKey(apiKey) {
  const secret = normalizeYocoSecretKey(apiKey);
  const res = await fetch(`${YOCO_API_BASE}/webhooks`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Invalid Yoco API secret key");
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || "Could not verify Yoco API key");
  }
  const json = await res.json().catch(() => ({}));
  return { secret, subscriptions: json?.subscriptions || json?.data || [] };
}

/**
 * Register Paidly webhook on the merchant Yoco account.
 */
export async function registerYocoWebhook(apiKey, webhookUrl, name) {
  const secret = normalizeYocoSecretKey(apiKey);
  const res = await fetch(`${YOCO_API_BASE}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, url: webhookUrl }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || "Could not register Yoco webhook");
  }

  return {
    subscriptionId: json.id,
    webhookSecret: json.secret,
    mode: json.mode || null,
  };
}

/**
 * @param {string} apiKey
 * @param {string} subscriptionId
 */
export async function deleteYocoWebhook(apiKey, subscriptionId) {
  const secret = normalizeYocoSecretKey(apiKey);
  if (!subscriptionId) return;
  await fetch(`${YOCO_API_BASE}/webhooks/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {});
}

/**
 * Verify Yoco Standard Webhooks signature (whsec_ secret).
 */
export function verifyYocoStandardWebhook(rawBody, headers, webhookSecret) {
  const secret = String(webhookSecret || "").trim();
  if (!secret) return true;

  const msgId = headers["webhook-id"] || headers["webhook_id"];
  const timestamp = headers["webhook-timestamp"] || headers["webhook_timestamp"];
  const signatureHeader = headers["webhook-signature"] || headers["webhook_signature"];

  if (!msgId || !timestamp || !signatureHeader) return false;

  const signedContent = `${msgId}.${timestamp}.${rawBody}`;
  const keyMaterial = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key;
  try {
    key = Buffer.from(keyMaterial, "base64");
  } catch {
    key = Buffer.from(keyMaterial, "utf8");
  }

  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const signatures = String(signatureHeader)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(",") ? part.split(",")[1] : part.replace(/^v1[,=]/, "")));

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return expected === sig;
    }
  });
}

/**
 * Complete Yoco connect: validate key, create webhook, return connection fields.
 */
export async function completeYocoConnect({ apiKey, orgId, webhookToken, label }) {
  await validateYocoApiKey(apiKey);
  const webhookUrl = getWebhookPublicUrl(webhookToken);
  const registration = await registerYocoWebhook(
    apiKey,
    webhookUrl,
    `paidly-${String(orgId).slice(0, 8)}`
  );

  return {
    label: label || "Yoco POS",
    webhook_secret: registration.webhookSecret || undefined,
    config: {
      auth_type: "api_key",
      connection_method: "oauth_connect",
      yoco_webhook_subscription_id: registration.subscriptionId,
      yoco_mode: registration.mode,
      yoco_api_key_enc: encryptPosSecret(apiKey),
      connected_at: new Date().toISOString(),
    },
  };
}
