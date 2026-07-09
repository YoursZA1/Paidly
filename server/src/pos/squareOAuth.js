import crypto from "node:crypto";
import { encryptPosSecret, decryptPosSecret } from "./posSecretCrypto.js";
import { getWebhookPublicUrl } from "./posWebhookAuth.js";

function squareEnv() {
  const mode = String(process.env.SQUARE_ENVIRONMENT || "sandbox").trim().toLowerCase();
  const isSandbox = mode === "sandbox";
  return {
    isSandbox,
    connectBase: isSandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com",
    apiBase: isSandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com",
    applicationId: process.env.SQUARE_APPLICATION_ID || "",
    applicationSecret: process.env.SQUARE_APPLICATION_SECRET || "",
    personalAccessToken: process.env.SQUARE_PERSONAL_ACCESS_TOKEN || "",
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "",
  };
}

export function isSquareOAuthConfigured() {
  const { applicationId, applicationSecret } = squareEnv();
  return Boolean(applicationId && applicationSecret);
}

export function getSquareOAuthRedirectUri() {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  return `${String(origin).replace(/\/$/, "")}/api/pos/oauth/callback/square`;
}

export function getSquareAppWebhookUrl() {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  return `${String(origin).replace(/\/$/, "")}/api/pos/webhook/provider/square`;
}

/**
 * @param {string} state
 */
export function buildSquareAuthorizeUrl(state) {
  const env = squareEnv();
  if (!env.applicationId) {
    throw new Error("Square OAuth is not configured (missing SQUARE_APPLICATION_ID)");
  }

  const scopes = ["PAYMENTS_READ", "ORDERS_READ", "MERCHANT_PROFILE_READ"];
  const params = new URLSearchParams({
    client_id: env.applicationId,
    scope: scopes.join(" "),
    session: "false",
    state,
    redirect_uri: getSquareOAuthRedirectUri(),
  });

  return `${env.connectBase}/oauth2/authorize?${params.toString()}`;
}

/**
 * @param {string} code
 */
export async function exchangeSquareAuthorizationCode(code) {
  const env = squareEnv();
  if (!env.applicationId || !env.applicationSecret) {
    throw new Error("Square OAuth is not configured");
  }

  const res = await fetch(`${env.apiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": "2024-10-17" },
    body: JSON.stringify({
      client_id: env.applicationId,
      client_secret: env.applicationSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getSquareOAuthRedirectUri(),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.errors?.[0]?.detail || "Square token exchange failed");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at,
    merchantId: json.merchant_id,
  };
}

/**
 * Ensure application-level webhook subscription exists (uses personal access token).
 */
export async function ensureSquareAppWebhookSubscription() {
  const env = squareEnv();
  if (!env.personalAccessToken) {
    console.warn("[square-oauth] SQUARE_PERSONAL_ACCESS_TOKEN unset — skipping webhook subscription ensure");
    return null;
  }

  const notificationUrl = getSquareAppWebhookUrl();
  const eventTypes = ["payment.created", "payment.updated", "order.updated"];

  const listRes = await fetch(`${env.apiBase}/v2/webhooks/subscriptions`, {
    headers: {
      Authorization: `Bearer ${env.personalAccessToken}`,
      "Square-Version": "2024-10-17",
    },
  });
  const listJson = await listRes.json().catch(() => ({}));
  const existing = (listJson.subscriptions || []).find(
    (sub) => String(sub.notification_url || "") === notificationUrl
  );
  if (existing?.id) return existing.id;

  const createRes = await fetch(`${env.apiBase}/v2/webhooks/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.personalAccessToken}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-10-17",
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      subscription: {
        name: "Paidly POS",
        event_types: eventTypes,
        notification_url: notificationUrl,
      },
    }),
  });

  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    throw new Error(createJson?.errors?.[0]?.detail || "Could not create Square webhook subscription");
  }

  return createJson.subscription?.id || null;
}

/**
 * @param {string} encryptedRefreshToken
 */
export async function refreshSquareAccessToken(encryptedRefreshToken) {
  const refreshToken = decryptPosSecret(encryptedRefreshToken);
  if (!refreshToken) throw new Error("Missing Square refresh token");

  const env = squareEnv();
  const res = await fetch(`${env.apiBase}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Square-Version": "2024-10-17" },
    body: JSON.stringify({
      client_id: env.applicationId,
      client_secret: env.applicationSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || "Square token refresh failed");
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: json.expires_at,
    merchantId: json.merchant_id,
    accessTokenEnc: encryptPosSecret(json.access_token),
    refreshTokenEnc: encryptPosSecret(json.refresh_token || refreshToken),
  };
}

/**
 * Verify Square webhook signature (application notification URL).
 * @param {string} rawBody
 * @param {string} signatureHeader
 * @param {string} notificationUrl
 */
export function verifySquareWebhookSignature(rawBody, signatureHeader, notificationUrl) {
  const key = squareEnv().webhookSignatureKey;
  if (!key) return true;

  const signature = String(signatureHeader || "").trim();
  if (!signature) return false;

  const payload = notificationUrl + rawBody;
  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function extractSquareMerchantId(payload) {
  const data = payload?.data || {};
  const obj = data.object || {};
  const payment = obj.payment || obj;
  return (
    payment.merchant_id ||
    obj.merchant_id ||
    payload.merchant_id ||
    data.merchant_id ||
    null
  );
}
