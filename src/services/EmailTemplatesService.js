/**
 * Company email templates (plan feature email_templates) — GET/PUT /api/company/email-templates.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";

async function request(method, body) {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
  const res = await apiRequest(`${apiBase}/api/company/email-templates`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text().catch(() => "");
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(json.error || res.statusText || "Email templates request failed");
    err.code = json.code;
    throw err;
  }
  return { templates: json.templates || {}, allowed: json.allowed === true };
}

/** @returns {Promise<{ templates: object, allowed: boolean }>} */
export function fetchEmailTemplates() {
  return request("GET");
}

/** @param {object} templates { invoice: { subject, message }, quote: { subject, message } } */
export function saveEmailTemplates(templates) {
  return request("PUT", { templates });
}
