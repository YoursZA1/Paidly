/**
 * Canonical lifecycle vocabulary for Paidly connection/session orchestration.
 * Product-facing UX states remain in {@link SESSION_STATUS} (session health); this models the **connection OS** view.
 *
 * @see docs/CONNECTION_LIFECYCLE_ARCHITECTURE.md
 */

/** @typedef {(typeof ConnectionState)[keyof typeof ConnectionState]} ConnectionStateValue */

export const ConnectionState = Object.freeze({
  CONNECTED: "CONNECTED",
  UNSTABLE: "UNSTABLE",
  RECOVERING: "RECOVERING",
  DEGRADED: "DEGRADED",
  REAUTH_REQUIRED: "REAUTH_REQUIRED",
  EXPIRED: "EXPIRED",
});

/** @typedef {(typeof LifecycleEventType)[keyof typeof LifecycleEventType]} LifecycleEventTypeValue */

export const LifecycleEventType = Object.freeze({
  NETWORK_OFFLINE: "NETWORK_OFFLINE",
  NETWORK_ONLINE: "NETWORK_ONLINE",

  VISIBILITY_HIDDEN: "VISIBILITY_HIDDEN",
  VISIBILITY_VISIBLE: "VISIBILITY_VISIBLE",

  TOKEN_REFRESH_SUCCESS: "TOKEN_REFRESH_SUCCESS",
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
  TOKEN_REFRESH_SKIPPED: "TOKEN_REFRESH_SKIPPED",
  /** Coalesced into an in-flight refresh; not failure, not skip (throttle). */
  TOKEN_REFRESH_RETRYING: "TOKEN_REFRESH_RETRYING",
  TOKEN_REFRESH_FATAL: "TOKEN_REFRESH_FATAL",

  REALTIME_CONNECTED: "REALTIME_CONNECTED",
  REALTIME_DISCONNECTED: "REALTIME_DISCONNECTED",
  REALTIME_STALE: "REALTIME_STALE",

  SESSION_MISSING: "SESSION_MISSING",
  SESSION_RECOVERED: "SESSION_RECOVERED",

  WAKE_DETECTED: "WAKE_DETECTED",

  USER_ACTIVITY: "USER_ACTIVITY",
  USER_IDLE: "USER_IDLE",

  RECOVERY_STARTED: "RECOVERY_STARTED",
  RECOVERY_COMPLETED: "RECOVERY_COMPLETED",
  RECOVERY_FAILED: "RECOVERY_FAILED",
});

/**
 * @typedef {object} LifecycleEvent
 * @property {LifecycleEventTypeValue} type
 * @property {Record<string, unknown>} [payload]
 */
