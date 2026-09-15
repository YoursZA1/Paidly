import { supabaseAdmin } from "../supabaseAdmin.js";
import { PAIDLY_PAY_ERROR, PAIDLY_PAY_SCOPES } from "../../../shared/payments/paidlyPayContract.js";
import { sha256Hex, timingSafeEqualString } from "./paidlyPayHmac.js";
import { sendPaidlyError } from "./paidlyPayHttp.js";

const ENV_SCOPES = Object.freeze([...PAIDLY_PAY_SCOPES]);

function readBearer(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function splitApiKey(token) {
  const raw = String(token || "").trim();
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return { keyId: null, secret: raw };
  }
  return { keyId: raw.slice(0, dot), secret: raw.slice(dot + 1) };
}

function scopesFromRow(row) {
  const list = Array.isArray(row?.scopes) ? row.scopes.map((s) => String(s).trim()) : [];
  return list.filter((scope) => PAIDLY_PAY_SCOPES.includes(scope));
}

async function lookupDbKey(keyId) {
  if (!keyId) return null;
  const { data, error } = await supabaseAdmin
    .from("paidly_api_keys")
    .select("id, org_id, company_id, key_id, secret_hash, name, status, scopes, expires_at")
    .eq("key_id", keyId)
    .maybeSingle();
  if (error) {
    if (/paidly_api_keys|schema cache|does not exist/i.test(error.message || "")) return null;
    throw error;
  }
  return data || null;
}

async function touchLastUsed(keyRowId) {
  if (!keyRowId) return;
  try {
    await supabaseAdmin
      .from("paidly_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRowId);
  } catch {
    /* best-effort */
  }
}

function envAuthPrincipal() {
  const secret = String(process.env.POS_API_KEY || "").trim();
  const orgId = String(process.env.POS_API_ORG_ID || "").trim();
  if (!secret || !orgId) return null;
  return {
    source: "env",
    keyId: "env",
    keyRowId: null,
    orgId,
    companyId: String(process.env.POS_API_COMPANY_ID || "").trim() || null,
    scopes: ENV_SCOPES,
    webhookSecret: String(process.env.POS_WEBHOOK_SECRET || "").trim() || null,
  };
}

export async function authenticatePaidlyPayRequest(req) {
  const token = readBearer(req);
  if (!token) {
    const error = new Error("Missing API key");
    error.code = PAIDLY_PAY_ERROR.UNAUTHORIZED;
    error.status = 401;
    throw error;
  }

  const { keyId, secret } = splitApiKey(token);
  if (!secret) {
    const error = new Error("Invalid API key");
    error.code = PAIDLY_PAY_ERROR.UNAUTHORIZED;
    error.status = 401;
    throw error;
  }

  const dbRow = await lookupDbKey(keyId);
  if (dbRow) {
    const expired = dbRow.expires_at && new Date(dbRow.expires_at).getTime() <= Date.now();
    if (dbRow.status !== "active" || expired || !timingSafeEqualString(dbRow.secret_hash, sha256Hex(secret))) {
      const error = new Error("Invalid API key");
      error.code = PAIDLY_PAY_ERROR.UNAUTHORIZED;
      error.status = 401;
      throw error;
    }
    await touchLastUsed(dbRow.id);
    return {
      source: "db",
      keyId: dbRow.key_id,
      keyRowId: dbRow.id,
      orgId: dbRow.org_id,
      companyId: dbRow.company_id || null,
      scopes: scopesFromRow(dbRow).length ? scopesFromRow(dbRow) : ENV_SCOPES,
      webhookSecret: null,
    };
  }

  const envPrincipal = envAuthPrincipal();
  if (envPrincipal && !keyId && timingSafeEqualString(process.env.POS_API_KEY, secret)) {
    return envPrincipal;
  }

  const error = new Error("Invalid API key");
  error.code = PAIDLY_PAY_ERROR.UNAUTHORIZED;
  error.status = 401;
  throw error;
}

export function assertPaidlyScope(auth, scope) {
  if (!auth?.scopes?.includes(scope)) {
    const error = new Error("This API key cannot perform that action");
    error.code = PAIDLY_PAY_ERROR.FORBIDDEN;
    error.status = 403;
    throw error;
  }
}

export function resolveOwnedCompanyId(auth, requestedCompanyId) {
  const requested = requestedCompanyId ? String(requestedCompanyId).trim() : "";
  if (auth.companyId) {
    if (requested && requested !== String(auth.companyId)) {
      const error = new Error("This API key cannot access another company");
      error.code = PAIDLY_PAY_ERROR.CROSS_COMPANY_DENIED;
      error.status = 403;
      throw error;
    }
    return auth.companyId;
  }
  return requested || null;
}

export async function requirePaidlyPayAuth(req, res, requestId, scope) {
  try {
    const auth = await authenticatePaidlyPayRequest(req);
    if (scope) assertPaidlyScope(auth, scope);
    req.paidlyAuth = auth;
    return auth;
  } catch (err) {
    const status = err.status || 401;
    const code = err.code || PAIDLY_PAY_ERROR.UNAUTHORIZED;
    sendPaidlyError(res, status, code, err.message || "Unauthorized", requestId);
    return null;
  }
}

export function webhookSecretsToTry(auth) {
  const secrets = [];
  const envSecret = String(process.env.POS_WEBHOOK_SECRET || "").trim();
  if (auth?.webhookSecret) secrets.push(auth.webhookSecret);
  if (envSecret) secrets.push(envSecret);
  return [...new Set(secrets)];
}
