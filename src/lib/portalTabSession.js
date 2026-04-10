/**
 * Tab-scoped persistence for the client portal only (survives refresh, cleared on tab close).
 * Single storage key — not app auth; the server token is validated against Supabase on each API call.
 */
const KEY = "paidly_portal_tab_v1";

export function readPortalTabSession() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
    if (!token || !email) return null;
    return { token, email };
  } catch {
    return null;
  }
}

export function writePortalTabSession({ token, email }) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!token || !email) return;
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        token: String(token).trim(),
        email: String(email).trim().toLowerCase(),
        v: 1,
      })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPortalTabSession() {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
