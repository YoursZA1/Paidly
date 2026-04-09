const AUTH_USER_KEY = "breakapi_user";

function isLikelyValidAuthUser(value) {
  if (!value || typeof value !== "object") return false;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const emailRaw = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const hasId = id.length > 0;
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
  return hasId && hasEmail;
}

function parseStoredUser(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isLikelyValidAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readSessionUser() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return parseStoredUser(sessionStorage.getItem(AUTH_USER_KEY));
  } catch {
    return null;
  }
}

function readLegacyLocalUser() {
  try {
    if (typeof localStorage === "undefined") return null;
    return parseStoredUser(localStorage.getItem(AUTH_USER_KEY));
  } catch {
    return null;
  }
}

export function readStoredAuthUser() {
  const sessionUser = readSessionUser();
  if (sessionUser) return sessionUser;

  const legacyUser = readLegacyLocalUser();
  if (!legacyUser) return null;

  // Migrate away from localStorage for auth/session-related user shape.
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(legacyUser));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore
  }
  return legacyUser;
}

export function writeStoredAuthUser(user) {
  if (!isLikelyValidAuthUser(user)) return;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearStoredAuthUser() {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // ignore
  }
}
