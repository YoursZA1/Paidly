/**
 * Semantic ingress for {@link createConnectionLifecycleManager}. Subsystems report **facts**;
 * the manager runs {@link buildLifecyclePlan} and executes **at most** the allowed session effects.
 */
export const LifecycleSignalType = Object.freeze({
  /** Main multiplexed realtime channel lost (error / close / timeout). */
  REALTIME_DISCONNECTED: "REALTIME_DISCONNECTED",
  /** Main realtime channel joined. */
  REALTIME_SUBSCRIBED: "REALTIME_SUBSCRIBED",
  /** Refresh queue declined work (throttle / halt / already expired) — never escalates session. */
  REFRESH_SKIPPED: "REFRESH_SKIPPED",
  /** Another refresh is already running; this caller coalesced — read model only; never escalates session. */
  REFRESH_RETRYING: "REFRESH_RETRYING",
  /** Tab visible again but session probe failed — recover, do not expire. */
  VISIBILITY_RESTORE_FAILED: "VISIBILITY_RESTORE_FAILED",
  /** Legacy adapter path: something reported realtime unstable by reason string. */
  TRANSPORT_REALTIME_UNSTABLE: "TRANSPORT_REALTIME_UNSTABLE",
});
