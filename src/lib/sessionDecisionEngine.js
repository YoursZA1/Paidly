/**
 * Centralized session decision policy.
 * Keeps transport instability separate from true re-auth requirements.
 */
export const SESSION_DECISION = {
  NONE: "none",
  RECONNECTING: "reconnecting",
  REAUTH_REQUIRED: "reauth_required",
};

function normalizeReason(reason) {
  return String(reason || "").trim().toLowerCase();
}

export function decideSessionAction({
  reason,
  believedSignedIn = false,
  online = true,
  refreshFatal = false,
} = {}) {
  if (!believedSignedIn) {
    return {
      action: SESSION_DECISION.NONE,
      reason: normalizeReason(reason) || "guest",
    };
  }

  const normalizedReason = normalizeReason(reason);

  if (refreshFatal) {
    return {
      action: SESSION_DECISION.REAUTH_REQUIRED,
      reason: normalizedReason || "fatal_refresh_token",
    };
  }

  if (!online) {
    return {
      action: SESSION_DECISION.RECONNECTING,
      reason: normalizedReason || "offline",
    };
  }

  if (
    normalizedReason.includes("signed_out") ||
    normalizedReason.includes("unauthorized") ||
    normalizedReason.includes("401") ||
    normalizedReason.includes("reauth")
  ) {
    return {
      action: SESSION_DECISION.REAUTH_REQUIRED,
      reason: normalizedReason || "reauth_required",
    };
  }

  if (
    normalizedReason.includes("reconnect") ||
    normalizedReason.includes("refresh_failed") ||
    normalizedReason.includes("session_missing")
  ) {
    return {
      action: SESSION_DECISION.RECONNECTING,
      reason: normalizedReason || "session_reconnecting",
    };
  }

  return {
    action: SESSION_DECISION.RECONNECTING,
    reason: normalizedReason || "session_reconnecting",
  };
}
