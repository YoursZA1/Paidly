/**
 * Nuclear client reset: clears all origin storage and loads sign-in fresh.
 * Use only for confirmed broken/corrupt client state — not for "logged out" (normal guests must keep localStorage).
 */
export function resetApp() {
  if (typeof window === "undefined") return;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.assign("/login");
}
