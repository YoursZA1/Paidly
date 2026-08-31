import { companyInvitePath, POS_INVITE_SOURCE, posInvitePath } from "../../shared/posStaffInvite.js";

export const PAIDLY_PRODUCTION_ORIGIN = "https://www.paidly.co.za";

const ORIGIN_ENV_KEYS = ["PUBLIC_APP_URL", "PUBLIC_APP_ORIGIN", "APP_URL", "VITE_APP_URL"];

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizePublicOrigin(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * @param {string} origin
 * @returns {boolean}
 */
export function isUnsafePublicInviteOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
      return true;
    }
    if (host.endsWith(".vercel.app") || host.endsWith(".now.sh")) return true;
    return false;
  } catch {
    return true;
  }
}

function originCandidates(env) {
  const list = [];
  for (const key of ORIGIN_ENV_KEYS) {
    if (env[key]) list.push(env[key]);
  }
  if (env.CLIENT_ORIGIN) {
    for (const part of String(env.CLIENT_ORIGIN).split(",")) {
      list.push(part);
    }
  }
  return list;
}

/**
 * Production invite links must never point at localhost or Vercel previews.
 * @param {{ env?: NodeJS.ProcessEnv, nodeEnv?: string }} [opts]
 */
export function resolvePublicAppOrigin({ env = process.env, nodeEnv = process.env.NODE_ENV } = {}) {
  const production = String(nodeEnv || "").toLowerCase() === "production";
  for (const raw of originCandidates(env || {})) {
    const origin = normalizePublicOrigin(raw);
    if (!origin) continue;
    if (production && isUnsafePublicInviteOrigin(origin)) continue;
    return origin;
  }
  return PAIDLY_PRODUCTION_ORIGIN;
}

/**
 * Durable invite URL from the stored hex token (or POS short code).
 * @param {string} tokenOrCode
 * @param {{ source?: string, origin?: string, env?: NodeJS.ProcessEnv, nodeEnv?: string }} [opts]
 */
export function companyInviteShareUrl(tokenOrCode, { source, origin, env, nodeEnv } = {}) {
  const base = String(origin || resolvePublicAppOrigin({ env, nodeEnv })).replace(/\/$/, "");
  const token = String(tokenOrCode || "").trim();
  if (String(source || "").toLowerCase() === POS_INVITE_SOURCE) {
    return posInvitePath(token, base);
  }
  return companyInvitePath(token, base);
}
