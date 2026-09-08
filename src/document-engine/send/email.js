/**
 * Browser email transport — existing Resend edge function + `/api/send-invoice` fallback.
 * Do not add a second email provider.
 */
import { getStableSession, getStableSessionResult } from "@/core/auth/SessionCoordinator";
import { getPublicApiBase } from "@/api/backendClient";
import {
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
} from "@shared/documents/documentEngine.js";

function redactSendErrorDetails(raw) {
  const text = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
  return text
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/re_[A-Za-z0-9_]+/g, "[redacted]")
    .slice(0, 400);
}

export function userFacingDocumentSendError(raw, fallback) {
  const s = redactSendErrorDetails(raw);
  if (/no email|missing client email|recipient missing/i.test(s)) return "Recipient has no email address.";
  if (/invalid email/i.test(s)) return "Email address is invalid.";
  if (/share token/i.test(s)) return "Document URL could not be generated. Please try again.";
  if (/pdf/i.test(s) && /fail|generat|read/i.test(s)) return "PDF generation failed. Please try again.";
  if (/not configured|misconfigured|RESEND/i.test(s)) {
    return "Email service is unavailable. Please try again later.";
  }
  if (/unauthorized|not signed in|logged in/i.test(s)) {
    return "You must be logged in to send emails.";
  }
  if (/too large|413/i.test(s)) {
    return "PDF is too large to email. Please try again or share a link.";
  }
  if (!s || s.trim().startsWith("{") || s.length > 180) {
    return fallback || "Document could not be sent. Please try again.";
  }
  return s;
}

async function readFetchBody(res) {
  const text = await res.text().catch(() => "");
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { text, json };
}

function assertProviderAccepted(res, body, label) {
  const errorPayload = body.json?.error || body.json?.message || body.text;
  if (!res.ok) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      userFacingDocumentSendError(errorPayload, `${label} rejected the request.`)
    );
  }
  if (body.json && body.json.success === false) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      userFacingDocumentSendError(errorPayload, `${label} rejected the request.`)
    );
  }
}

function normalizeIdempotencyKey(raw) {
  const key = String(raw || "").trim();
  if (!key) return "";
  return key.slice(0, 256);
}

/**
 * Canonical document email dispatch.
 * Primary: Supabase edge `send-invoice-email` (Resend). Fallback: POST /api/send-invoice.
 */
export async function dispatchDocumentEmail({
  pdfBase64,
  email,
  subject,
  html,
  filename,
  invoiceNum,
  fromName,
  clientName,
  amountDue,
  dueDate,
  idempotencyKey,
} = {}) {
  const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseUrl = String(rawSupabaseUrl).replace(/\.supabase\.com/gi, ".supabase.co").trim();
  if (!supabaseUrl) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      "Email service is unavailable. Please try again later."
    );
  }

  const sessionResult = await getStableSessionResult();
  if (sessionResult?.error) throw sessionResult.error;
  const accessToken =
    sessionResult?.data?.session?.access_token || (await getStableSession())?.access_token;
  if (!accessToken) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      "You must be logged in to send emails."
    );
  }

  const idempotency = normalizeIdempotencyKey(idempotencyKey);

  let primaryError = null;
  try {
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-invoice-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        pdfBase64,
        email,
        subject,
        html,
        filename,
        ...(idempotency ? { idempotencyKey: idempotency } : {}),
      }),
    });
    const body = await readFetchBody(sendRes);
    assertProviderAccepted(sendRes, body, "Email service");
    return { success: true, channel: "edge", provider: body.json || { success: true } };
  } catch (edgeErr) {
    primaryError = edgeErr;
  }

  const apiBase = getPublicApiBase() || "";
  const fallbackRes = await fetch(`${apiBase}/api/send-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      base64PDF: pdfBase64,
      clientEmail: email,
      invoiceNum: String(invoiceNum || ""),
      fromName: String(fromName || "Paidly"),
      clientName: String(clientName || "there"),
      amountDue: String(amountDue ?? ""),
      dueDate: String(dueDate || ""),
      ...(idempotency ? { idempotencyKey: idempotency } : {}),
    }),
  });
  const fallbackBody = await readFetchBody(fallbackRes);
  try {
    assertProviderAccepted(fallbackRes, fallbackBody, "Email service");
  } catch (fallbackErr) {
    const primaryMsg = primaryError?.message || "Email service failed";
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      userFacingDocumentSendError(
        `${primaryMsg} | ${fallbackErr.message}`,
        "Document could not be sent. Please try again."
      )
    );
  }
  return { success: true, channel: "api", provider: fallbackBody.json || { success: true } };
}

/** @deprecated Use {@link dispatchDocumentEmail} */
export const dispatchInvoiceEmailViaCanonicalPath = dispatchDocumentEmail;
