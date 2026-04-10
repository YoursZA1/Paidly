/**
 * Public payslip by share token: full payload only after email verification when sent_to_email is set.
 * Viewer token: HMAC-signed JWT-like blob (same secret as client-portal / public invoice).
 */
import crypto from "node:crypto";
import { getPortalSigningSecret } from "./client-portal/shared.js";
import {
  bearerTokenFromReq,
  getSupabaseAdmin,
  isValidShareTokenUuid,
  maskEmail,
  normalizeEmail,
} from "./public-invoice-shared.js";

const VIEWER_TTL_SEC = 7 * 24 * 60 * 60;
const VIEWER_TYP = "payslip_pub_v1";

function signPayload(payloadObj) {
  const secret = getPortalSigningSecret();
  if (!secret) throw new Error("Signing secret not configured");
  const p = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const h = crypto.createHmac("sha256", secret).update(p).digest("base64url");
  return `${p}.${h}`;
}

export function signPublicPayslipViewerToken(shareToken, emailNorm) {
  const exp = Math.floor(Date.now() / 1000) + VIEWER_TTL_SEC;
  return signPayload({
    typ: VIEWER_TYP,
    st: String(shareToken).trim(),
    em: emailNorm,
    exp,
  });
}

export function verifyPublicPayslipViewerToken(token) {
  try {
    const secret = getPortalSigningSecret();
    if (!secret || !token) return null;
    const [p, h] = String(token).split(".");
    if (!p || !h) return null;
    const expected = crypto.createHmac("sha256", secret).update(p).digest("base64url");
    if (expected !== h) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.typ !== VIEWER_TYP || !payload.st || !payload.em) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { shareToken: payload.st, email: normalizeEmail(payload.em) };
  } catch {
    return null;
  }
}

async function loadOrgOwnerBranding(supabase, orgId) {
  if (!orgId) {
    return {
      owner_company_name: "",
      owner_company_address: "",
      owner_logo_url: null,
      owner_currency: "ZAR",
    };
  }
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.owner_id) {
    return {
      owner_company_name: "",
      owner_company_address: "",
      owner_logo_url: null,
      owner_currency: "ZAR",
    };
  }
  const { data: prof } = await supabase
    .from("profiles")
    .select("company_name, company_address, logo_url, currency")
    .eq("id", org.owner_id)
    .maybeSingle();
  return {
    owner_company_name: prof?.company_name ?? "",
    owner_company_address: prof?.company_address ?? "",
    owner_logo_url: prof?.logo_url ?? null,
    owner_currency: prof?.currency ?? "ZAR",
  };
}

function buildTeaserPayslip(row, branding) {
  return {
    id: row.id,
    payslip_number: row.payslip_number,
    pay_date: row.pay_date,
    employee_name: row.employee_name,
    status: row.status,
    sent_to_email: row.sent_to_email,
    ...branding,
  };
}

/**
 * @returns {Promise<{ payslip: object }|{ error: string, status?: number }>}
 */
export async function loadPublicPayslipBundle(supabase, shareToken) {
  const { data: row, error } = await supabase
    .from("payslips")
    .select("*")
    .eq("public_share_token", shareToken)
    .maybeSingle();

  if (error) {
    return { error: "Failed to load payslip", status: 500 };
  }
  if (!row) {
    return { error: "Payslip not found", status: 404 };
  }

  const branding = await loadOrgOwnerBranding(supabase, row.org_id);
  const payslip = {
    ...row,
    created_date: row.created_at,
    updated_date: row.updated_at,
    ...branding,
  };

  return { payslip };
}

export async function handlePublicPayslipGet(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const raw = req.query?.token;
  const shareToken = typeof raw === "string" ? raw.trim() : "";
  if (!shareToken || !isValidShareTokenUuid(shareToken)) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const bundle = await loadPublicPayslipBundle(supabase, shareToken);
    if (bundle.error) {
      return res.status(bundle.status || 500).json({ error: bundle.error });
    }

    const { payslip } = bundle;
    const sentTo = payslip.sent_to_email ? normalizeEmail(payslip.sent_to_email) : "";

    if (!sentTo) {
      return res.status(200).json({
        requiresEmailVerification: false,
        payslip,
      });
    }

    const viewer = verifyPublicPayslipViewerToken(bearerTokenFromReq(req));
    const okViewer =
      viewer &&
      viewer.shareToken.toLowerCase() === shareToken.toLowerCase() &&
      viewer.email === sentTo;

    if (okViewer) {
      return res.status(200).json({
        requiresEmailVerification: false,
        payslip,
      });
    }

    const branding = {
      owner_company_name: payslip.owner_company_name,
      owner_company_address: payslip.owner_company_address,
      owner_logo_url: payslip.owner_logo_url,
      owner_currency: payslip.owner_currency,
    };

    return res.status(200).json({
      requiresEmailVerification: true,
      sentToEmailHint: maskEmail(payslip.sent_to_email),
      payslip: buildTeaserPayslip(payslip, branding),
    });
  } catch (e) {
    console.error("[public-payslip]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}

function parseJsonBody(req) {
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

export async function handlePublicPayslipVerify(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getPortalSigningSecret()) {
    return res.status(503).json({ error: "Viewer signing not configured" });
  }

  const body = parseJsonBody(req);
  const shareToken = typeof body?.token === "string" ? body.token.trim() : "";
  const email = normalizeEmail(body?.email);

  if (!shareToken || !isValidShareTokenUuid(shareToken) || !email) {
    return res.status(400).json({ error: "Invalid token or email" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  try {
    const bundle = await loadPublicPayslipBundle(supabase, shareToken);
    if (bundle.error) {
      return res.status(bundle.status === 404 ? 404 : 400).json({ error: bundle.error });
    }

    const sentTo = bundle.payslip.sent_to_email
      ? normalizeEmail(bundle.payslip.sent_to_email)
      : "";
    if (!sentTo) {
      return res.status(400).json({ error: "This payslip does not require email verification" });
    }
    if (email !== sentTo) {
      return res.status(403).json({ error: "Email does not match our records" });
    }

    const viewerToken = signPublicPayslipViewerToken(shareToken, email);
    return res.status(200).json({ viewerToken, expiresInSeconds: VIEWER_TTL_SEC });
  } catch (e) {
    console.error("[public-payslip/verify]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}
