/**
 * Canonical auth user id for the signed-in app user (profiles / org scope).
 * Prefer explicit id; fall back to Supabase auth aliases used across legacy shapes.
 */
export function getAuthUserId(user) {
  if (!user || typeof user !== "object") return null;
  const raw = user.id ?? user.supabase_id ?? user.auth_id ?? null;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

export function assertAuthUserId(user, message = "Not authenticated") {
  const id = getAuthUserId(user);
  if (!id) {
    throw new Error(message);
  }
  return id;
}
