/**
 * Public payslip by share token: full payload only after email verification when sent_to_email is set.
 * Viewer token: HMAC-signed JWT-like blob (same secret as client-portal / public invoice).
 */
import crypto from "node:crypto";
import { buildSecurePayslipPdf, PAYSLIP_ID_REQUIRED } from "../server/src/payroll/payslipPdf.js";
import { getPortalSigningSecret } from "./client-portal/_shared.js";
import {
  bearerTokenFromReq,
  getSupabaseAdmin,
  isValidShareTokenUuid,
  maskEmail,
  normalizeEmail,
} from "./_publicInvoiceShared.js";

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

/**
 * Public payslips always require token + email. Prefer the emailed address,
 * then the employee email. Never return a full payslip from the token alone.
 */
export function publicPayslipGateEmail(payslip) {
  return normalizeEmail(payslip?.sent_to_email) || normalizeEmail(payslip?.employee_email) || "";
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

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req?.socket?.remoteAddress || "unknown";
}

async function recordFailedPayslipVerify(payslip, req, reason) {
  try {
    const { logSecurity } = await import("../server/src/securityMiddleware.js");
    logSecurity("warn", "public_payslip_verify_failed", {
      orgId: payslip?.org_id || null,
      payslipId: payslip?.id || null,
      reason,
      ip: clientIp(req),
    });
    if (payslip?.org_id && payslip?.id) {
      const { writePayrollAudit } = await import("../server/src/payroll/payrollGate.js");
      await writePayrollAudit({
        orgId: payslip.org_id,
        action: "PUBLIC_PAYSLIP_VERIFY_FAILED",
        recordType: "payslips",
        recordId: payslip.id,
        metadata: { reason, ip: clientIp(req) },
      });
    }
  } catch (err) {
    console.warn("[public-payslip/verify] audit failed:", err?.message || err);
  }
}

async function recordPayslipObserve(supabase, payslip, req) {
  if (!payslip?.org_id || !payslip?.id) return;
  const observe = String(req?.query?.observe || req?.query?.event || "opened").toLowerCase();
  const { recordPublicDocumentInteraction } = await import("../server/src/documents/documentEventService.js");
  const { DOCUMENT_EVENT_SOURCE, DOCUMENT_EVENT_TYPE } = await import("../shared/documents/documentEvents.js");
  const events = [];
  if (observe === "clicked") events.push({ eventType: DOCUMENT_EVENT_TYPE.clicked, action: "view_payslip" });
  else if (observe === "downloaded") {
    events.push({ eventType: DOCUMENT_EVENT_TYPE.opened, action: null });
    events.push({ eventType: DOCUMENT_EVENT_TYPE.downloaded, action: "download_payslip" });
  } else {
    events.push({ eventType: DOCUMENT_EVENT_TYPE.opened, action: null });
  }
  for (const item of events) {
    await recordPublicDocumentInteraction(
      {
        orgId: payslip.org_id,
        sourceKind: DOCUMENT_EVENT_SOURCE.PAYSLIP,
        sourceId: payslip.id,
        eventType: item.eventType,
        action: item.action,
        source: "payslip_secure_page",
        metadata: { ip: clientIp(req) },
      },
      supabase
    );
  }
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
    const gateEmail = publicPayslipGateEmail(payslip);

    const viewer = verifyPublicPayslipViewerToken(bearerTokenFromReq(req));
    const okViewer =
      Boolean(gateEmail) &&
      viewer &&
      viewer.shareToken.toLowerCase() === shareToken.toLowerCase() &&
      viewer.email === gateEmail;

    if (okViewer) {
      await recordPayslipObserve(supabase, payslip, req);
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
      sentToEmailHint: gateEmail ? maskEmail(gateEmail) : "",
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

    const gateEmail = publicPayslipGateEmail(bundle.payslip);
    if (!gateEmail) {
      await recordFailedPayslipVerify(bundle.payslip, req, "not_emailed");
      return res.status(403).json({
        error: "This payslip cannot be opened on a public link until it has been emailed to the employee.",
      });
    }
    if (email !== gateEmail) {
      await recordFailedPayslipVerify(bundle.payslip, req, "email_mismatch");
      return res.status(403).json({ error: "Email does not match our records" });
    }

    const viewerToken = signPublicPayslipViewerToken(shareToken, email);
    return res.status(200).json({ viewerToken, expiresInSeconds: VIEWER_TTL_SEC });
  } catch (e) {
    console.error("[public-payslip/verify]", e);
    return res.status(500).json({ error: e?.message || "Failed" });
  }
}

/**
 * GET /api/public-payslip-pdf?token=… — encrypted PDF for a verified viewer of a shared payslip.
 * Same gate as the full payload (email-verified viewer token). The PDF opens only with the
 * employee's SA ID number, so a forwarded file or link alone does not expose the payslip.
 */
export async function handlePublicPayslipPdf(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query?.token;
  const shareToken = typeof raw === "string" ? raw.trim() : "";
  if (!shareToken || !isValidShareTokenUuid(shareToken)) return res.status(400).json({ error: "Invalid token" });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured" });

  const { data: row, error } = await supabase.from("payslips").select("*").eq("public_share_token", shareToken).maybeSingle();
  if (error) return res.status(500).json({ error: "Failed to load payslip" });
  if (!row) return res.status(404).json({ error: "Payslip not found" });

  const gateEmail = publicPayslipGateEmail(row);
  const viewer = verifyPublicPayslipViewerToken(bearerTokenFromReq(req));
  const okViewer =
    Boolean(gateEmail) && viewer && viewer.shareToken.toLowerCase() === shareToken.toLowerCase() && viewer.email === gateEmail;
  if (!okViewer) return res.status(401).json({ error: "Verify your email to download this payslip", requiresEmailVerification: true });

  let profile = null;
  if (row.payroll_profile_id) {
    ({ data: profile } = await supabase
      .from("payroll_profiles")
      .select("id, tax_identifiers")
      .eq("org_id", row.org_id)
      .eq("id", row.payroll_profile_id)
      .maybeSingle());
  }
  if (!profile && row.membership_id) {
    ({ data: profile } = await supabase
      .from("payroll_profiles")
      .select("id, tax_identifiers")
      .eq("org_id", row.org_id)
      .eq("membership_id", row.membership_id)
      .maybeSingle());
  }
  const audit = async (action, status, reason = null) => {
    try {
      await supabase.from("payroll_audit_logs").insert({
        org_id: row.org_id,
        actor_id: null,
        action,
        record_type: "payslips",
        record_id: row.id,
        metadata: { payslip_id: row.id, employee_id: row.membership_id || null, delivery_method: "public_link", status, ...(reason ? { reason } : {}) },
      });
    } catch {
      /* audit is best-effort */
    }
  };
  try {
    const pdf = await buildSecurePayslipPdf(row, profile || {});
    await audit("PAYSLIP_PDF_GENERATED", "success");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(pdf.content);
  } catch (err) {
    const missingId = err?.code === PAYSLIP_ID_REQUIRED;
    await audit("PAYSLIP_PDF_BLOCKED", "failure", missingId ? PAYSLIP_ID_REQUIRED : "PDF_RENDER_FAILED");
    return res.status(missingId ? 422 : 500).json({
      error: missingId
        ? "This payslip cannot be downloaded yet. Ask your employer to add your ID number to your payroll profile."
        : "Could not generate the payslip PDF",
      ...(missingId ? { code: PAYSLIP_ID_REQUIRED } : {}),
    });
  }
}
