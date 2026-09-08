import { createHash } from "node:crypto";

const REQUEST_FIELDS = Object.freeze([
  "SiteCode",
  "CountryCode",
  "CurrencyCode",
  "Amount",
  "TransactionReference",
  "BankReference",
  "Optional1",
  "Optional2",
  "Optional3",
  "Optional4",
  "Optional5",
  "Customer",
  "CancelUrl",
  "ErrorUrl",
  "SuccessUrl",
  "NotifyUrl",
  "IsTest",
]);

const NOTIFY_FIELDS = Object.freeze([
  "SiteCode",
  "TransactionId",
  "TransactionReference",
  "Amount",
  "Status",
  "Optional1",
  "Optional2",
  "Optional3",
  "Optional4",
  "Optional5",
  "CurrencyCode",
  "IsTest",
  "StatusMessage",
]);

export const OZOW_PAY_URL = "https://pay.ozow.com/";

export function ozowAmountString(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

export function ozowIsTestFlag(env = process.env) {
  const raw = String(env.OZOW_IS_TEST ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return "true";
  if (raw === "false" || raw === "0" || raw === "no") return "false";
  return String(env.NODE_ENV || "").toLowerCase() === "production" ? "false" : "true";
}

function fieldValue(fields, key) {
  const value = fields[key];
  if (value == null) return "";
  return String(value);
}

export function ozowSha512Hex(input) {
  return createHash("sha512").update(String(input), "utf8").digest("hex").toLowerCase();
}

export function buildOzowRequestHash(fields, privateKey) {
  const concat = REQUEST_FIELDS.map((key) => fieldValue(fields, key)).join("") + String(privateKey || "");
  return ozowSha512Hex(concat);
}

export function buildOzowNotifyHash(fields, privateKey) {
  const concat = NOTIFY_FIELDS.map((key) => fieldValue(fields, key)).join("") + String(privateKey || "");
  return ozowSha512Hex(concat);
}

export function hashesMatch(expected, actual) {
  const a = String(expected || "").trim().toLowerCase();
  const b = String(actual || "").trim().toLowerCase();
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyOzowNotifyHash(fields, privateKey) {
  const incoming = fields.Hash || fields.hash || fields.HashCheck || fields.hashCheck || "";
  const expected = buildOzowNotifyHash(fields, privateKey);
  return hashesMatch(expected, incoming);
}

export function ozowCredentials(env = process.env) {
  return {
    siteCode: String(env.OZOW_SITE_CODE || "").trim(),
    apiKey: String(env.OZOW_API_KEY || "").trim(),
    privateKey: String(env.OZOW_PRIVATE_KEY || "").trim(),
  };
}

export function bankReferenceFromIntent(intent) {
  const meta = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  const invoiceNumber = String(meta.invoice_number || "").replace(/[^A-Za-z0-9-]/g, "");
  if (invoiceNumber) return invoiceNumber.slice(0, 20);
  const id = String(intent?.id || "").replace(/-/g, "");
  return `PDLY${id.slice(-16)}`.slice(0, 20);
}

/**
 * Build the Ozow hosted-pay fields + SHA512 HashCheck.
 * TransactionReference is always the payment_intents UUID.
 */
export function buildOzowPaymentRequest(intent, urls, env = process.env) {
  const creds = ozowCredentials(env);
  const meta = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  const fields = {
    SiteCode: creds.siteCode,
    CountryCode: "ZA",
    CurrencyCode: String(intent.currency || "ZAR").trim().toUpperCase().slice(0, 3) || "ZAR",
    Amount: ozowAmountString(intent.amount),
    TransactionReference: String(intent.id),
    BankReference: bankReferenceFromIntent(intent),
    Optional1: String(intent.source_kind || "document"),
    Optional2: String(intent.document_id || intent.pos_sale_event_id || ""),
    Optional3: String(intent.org_id || ""),
    Optional4: "",
    Optional5: "",
    Customer: String(meta.customer_name || meta.customer || "").slice(0, 50),
    CancelUrl: String(urls.cancelUrl || urls.errorUrl || ""),
    ErrorUrl: String(urls.errorUrl || urls.cancelUrl || ""),
    SuccessUrl: String(urls.successUrl || ""),
    NotifyUrl: String(urls.notifyUrl || ""),
    IsTest: ozowIsTestFlag(env),
  };
  fields.HashCheck = buildOzowRequestHash(fields, creds.privateKey);
  return fields;
}

export function ozowRedirectUrl(fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, value == null ? "" : String(value));
  }
  return `${OZOW_PAY_URL}?${params.toString()}`;
}

export function normalizeOzowWebhookBody(body) {
  if (!body || typeof body !== "object") return {};
  const src = body;
  return {
    SiteCode: src.SiteCode ?? src.siteCode ?? "",
    TransactionId: src.TransactionId ?? src.transactionId ?? "",
    TransactionReference: src.TransactionReference ?? src.transactionReference ?? "",
    Amount: src.Amount ?? src.amount ?? "",
    Status: src.Status ?? src.status ?? "",
    Optional1: src.Optional1 ?? src.optional1 ?? "",
    Optional2: src.Optional2 ?? src.optional2 ?? "",
    Optional3: src.Optional3 ?? src.optional3 ?? "",
    Optional4: src.Optional4 ?? src.optional4 ?? "",
    Optional5: src.Optional5 ?? src.optional5 ?? "",
    CurrencyCode: src.CurrencyCode ?? src.currencyCode ?? "",
    IsTest: src.IsTest ?? src.isTest ?? "",
    StatusMessage: src.StatusMessage ?? src.statusMessage ?? "",
    Hash: src.Hash ?? src.hash ?? src.HashCheck ?? src.hashCheck ?? "",
  };
}
