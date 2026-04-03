/**
 * Validate SUPABASE_SERVICE_ROLE_KEY shape/claims to avoid silently using anon keys.
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const json = Buffer.from(payload + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined | null} key
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateServiceRoleKey(key) {
  const raw = String(key || "").trim();
  if (!raw) {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is missing." };
  }
  const payload = decodeJwtPayload(raw);
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is invalid JWT format." };
  }
  const role = String(payload.role || "").toLowerCase();
  if (role !== "service_role") {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY must be a service_role key (detected non-service role).",
    };
  }
  return { ok: true };
}

