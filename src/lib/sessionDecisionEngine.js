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

function hasAnyToken(reason, tokens) {
  return tokens.some((token) => reason.includes(token));
}

const TERMINAL_AUTH_REASON_TOKENS = Object.freeze([
  "signed_out",
  "reauth",
  "auth_expired",
  "session_revoked",
  "refresh_token_invalid",
  "fatal_refresh_token",
  "forced_sign_out",
  "token_desync",
  "storage_corruption",
  "auth_corruption",
  "app_version_mismatch",
  "401",
]);

const NETWORK_OR_TRANSPORT_REASON_TOKENS = Object.freeze([
  "offline",
  "network",
  "timeout",
  "timed out",
  "failed to fetch",
  "load failed",
  "reconnect",
  "refresh_failed",
  "session_missing",
  "background_sync",
  "tab_visible",
]);

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

  if (hasAnyToken(normalizedReason, NETWORK_OR_TRANSPORT_REASON_TOKENS)) {
    return {
      action: SESSION_DECISION.RECONNECTING,
      reason: normalizedReason || "session_reconnecting",
    };
  }

  if (hasAnyToken(normalizedReason, TERMINAL_AUTH_REASON_TOKENS)) {
    return {
      action: SESSION_DECISION.REAUTH_REQUIRED,
      reason: normalizedReason || "reauth_required",
    };
  }

  return {
    action: SESSION_DECISION.RECONNECTING,
    reason: normalizedReason || "session_reconnecting",
  };
}
