const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidPattern = new RegExp(`^${UUID}$`, "i");

function uuidOrNull(value) {
  const id = String(value || "").trim();
  return uuidPattern.test(id) ? id : null;
}

export function invoiceNotificationPath(id) {
  const uuid = uuidOrNull(id);
  return uuid ? `/ViewInvoice?id=${uuid}` : null;
}

export function quoteNotificationPath(id) {
  const uuid = uuidOrNull(id);
  return uuid ? `/ViewQuote?id=${uuid}` : null;
}

export function leaveNotificationPath(id) {
  const uuid = uuidOrNull(id);
  return uuid ? `/Leave?request=${uuid}` : "/Leave";
}

export function employeeLeaveNotificationPath(membershipId) {
  const uuid = uuidOrNull(membershipId);
  return uuid ? `/employees/${uuid}?tab=leave` : "/Leave";
}

export function payslipNotificationPath(id) {
  const uuid = uuidOrNull(id);
  return uuid ? `/ViewPayslip?id=${uuid}` : "/MyPayroll";
}

export function messageNotificationPath(deliveryId) {
  const uuid = uuidOrNull(deliveryId);
  return uuid ? `/Messages?delivery=${uuid}` : "/Messages";
}

export function employeeNotificationPath(membershipId) {
  const uuid = uuidOrNull(membershipId);
  return uuid ? `/employees/${uuid}` : null;
}

const ALLOWED_PATHS = [
  new RegExp(`^/ViewInvoice\\?id=${UUID}$`, "i"),
  new RegExp(`^/ViewQuote\\?id=${UUID}$`, "i"),
  new RegExp(`^/Leave(?:\\?request=${UUID})?$`, "i"),
  new RegExp(`^/employees/${UUID}(?:\\?tab=leave)?$`, "i"),
  new RegExp(`^/ViewPayslip\\?id=${UUID}$`, "i"),
  /^\/MyPayroll$/i,
  /^\/Payslips$/i,
  /^\/Settings\?tab=subscription$/i,
  new RegExp(`^/Messages(?:\\?delivery=${UUID})?$`, "i"),
];

/** In-app path only. Rejects external URLs and anything the bell should not open. */
export function safeNotificationPath(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return ALLOWED_PATHS.some((pattern) => pattern.test(path)) ? path : null;
}

/** Older rows stored only a sentence. Recover the document when the number is in the text. */
export function notificationLookupFromMessage(message) {
  const text = String(message || "");
  const invoice = text.match(/Invoice #([A-Za-z0-9][A-Za-z0-9-]*)/i);
  if (invoice) return { kind: "invoice_number", number: invoice[1] };
  const quote = text.match(/Quote #([A-Za-z0-9][A-Za-z0-9-]*)/i);
  if (quote) return { kind: "quote_number", number: quote[1] };
  if (/free trial|Settings → Subscription/i.test(text)) return { path: "/Settings?tab=subscription" };
  if (/payslip/i.test(text)) return { path: "/MyPayroll" };
  if (/leave/i.test(text)) return { path: "/Leave" };
  if (/message from|Paidly team/i.test(text)) return { path: "/Messages" };
  return null;
}
