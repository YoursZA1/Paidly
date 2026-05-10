import { useConnectionLifecycleStore } from "@/lib/connection/connectionLifecycleStore";
import { buildLifecyclePlan } from "@/lib/connection/lifecyclePolicy";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";
import { shouldHintRealtimeRecoveredFromSessionHealth, useSessionHealthStore } from "@/stores/sessionHealthStore";

/**
 * Operating-system style coordinator: subsystems **report** signals here. Semantic signals run
 * {@link buildLifecyclePlan} so transport noise does not become logout/reconnect storms — only this module
 * executes Authority effects from those plans.
 *
 * Domains: auth, refresh, realtime, visibility, network, sleep/wake, recovery — see {@link useConnectionLifecycleStore}.
 *
 * **Ingress:** `report({ type })` with {@link LifecycleSignalType} for policy-driven paths; convenience methods
 * (`markConnected`, `reportNetworkState`, …) for imperative call sites; {@link toSessionAuthorityAdapter} for
 * `registerSessionAuthority` so SessionOrchestrator stays the sole authority while this module owns the read model.
 *
 * @param {{ sessionManager: ReturnType<import('@/lib/session/SessionOrchestrator').createSessionOrchestrator> }} args
 */
export function createConnectionLifecycleManager({ sessionManager }) {
  const sink = sessionManager.Authority;
  const store = useConnectionLifecycleStore;

  function patch(p) {
    store.getState().patch(p);
  }

  function readModelSnapshot() {
    const s = store.getState();
    return {
      auth: s.auth,
      refresh: s.refresh,
      realtime: s.realtime,
      visibility: s.visibility,
      network: s.network,
      sleepWake: s.sleepWake,
      recovery: s.recovery,
    };
  }

  function runLifecyclePlan(signal) {
    const { steps } = buildLifecyclePlan(signal);
    for (const step of steps) {
      switch (step.kind) {
        case "patch":
          patch(step.data);
          break;
        case "mark_connected":
          sink.markConnected(step.reason);
          break;
        case "report_realtime_unstable":
          sink.reportRealtimeUnstable(step.reason);
          break;
        case "report_visibility_recover":
          sink.reportVisibilityRecover(step.reason);
          break;
        case "maybe_report_realtime_recovered":
          if (shouldHintRealtimeRecoveredFromSessionHealth(useSessionHealthStore.getState().status)) {
            sink.reportRealtimeRecovered("realtime_recovered");
          }
          break;
        default:
          break;
      }
    }
  }

  /**
   * Primary ingress: discriminated union. Prefer semantic {@link LifecycleSignalType} for transport/session edge cases.
   * @param {{ type: string } & Record<string, unknown>} signal
   */
  function report(signal) {
    switch (signal.type) {
      case LifecycleSignalType.REALTIME_SUBSCRIBED:
      case LifecycleSignalType.REALTIME_DISCONNECTED:
      case LifecycleSignalType.REFRESH_SKIPPED:
      case LifecycleSignalType.REFRESH_RETRYING:
      case LifecycleSignalType.VISIBILITY_RESTORE_FAILED:
      case LifecycleSignalType.TRANSPORT_REALTIME_UNSTABLE:
        runLifecyclePlan(signal);
        return;
      case "mark_connected":
        patch({ auth: { phase: "signed_in", lastReason: signal.reason ?? null } });
        sink.markConnected(signal.reason);
        break;
      case "mark_reconnecting":
        patch({ auth: { phase: "reconnecting", lastReason: signal.reason ?? null } });
        sink.markReconnecting(signal.reason);
        break;
      case "mark_expired_surface":
        patch({ auth: { phase: "expired_surface", lastReason: signal.reason ?? null } });
        sink.markExpiredSurface(signal.reason);
        break;
      case "report_realtime_unstable":
        runLifecyclePlan({ type: LifecycleSignalType.TRANSPORT_REALTIME_UNSTABLE, reason: signal.reason });
        break;
      case "report_realtime_recovered":
        patch({ realtime: { phase: "subscribed", lastReason: signal.reason ?? null } });
        sink.reportRealtimeRecovered(signal.reason);
        break;
      case "report_visibility_recover":
        patch({ visibility: "visible", sleepWake: { phase: "awake", hiddenAt: null } });
        sink.reportVisibilityRecover(signal.reason);
        break;
      case "report_offline":
        patch({ network: { online: false, updatedAt: Date.now() } });
        sink.reportOffline(signal.reason);
        break;
      case "report_refresh_required_visible":
        patch({ refresh: { phase: "required_visible", lastReason: null } });
        sink.reportRefreshRequiredVisible();
        break;
      case "report_refresh_starting":
        patch({
          refresh: {
            phase: "starting",
            lastReason: signal.offline ? "offline" : "refreshing",
          },
        });
        sink.reportRefreshStarting({ offline: Boolean(signal.offline) });
        break;
      case "report_refresh_ok":
        patch({ refresh: { phase: "ok", lastReason: signal.reason ?? null } });
        sink.reportRefreshOk(signal.reason);
        break;
      case "report_session_missing_during_reconnect":
        patch({ refresh: { phase: "session_missing", lastReason: null } });
        sink.reportSessionMissingDuringReconnect();
        break;
      case "mark_manual_logout_reset":
        patch({ auth: { phase: "signed_out", lastReason: "manual_logout" } });
        sink.markManualLogoutReset();
        break;
      case "visibility_state":
        patch({
          visibility: signal.visibility,
          sleepWake:
            signal.visibility === "hidden"
              ? { phase: "likely_asleep", hiddenAt: signal.hiddenAt ?? Date.now() }
              : { phase: "awake", hiddenAt: null },
        });
        break;
      case "network_state":
        patch({
          network: { online: signal.online, updatedAt: Date.now() },
        });
        if (!signal.online) sink.reportOffline(signal.reason ?? "offline");
        break;
      case "recovery_wake":
        patch({
          recovery: {
            phase: signal.phase,
            blockingMutations: signal.blockingMutations ?? false,
            reason: signal.reason ?? null,
          },
        });
        break;
      /** @deprecated Prefer {@link LifecycleSignalType.REALTIME_SUBSCRIBED} / REALTIME_DISCONNECTED */
      case "realtime_main_channel_status": {
        const { status } = signal;
        if (status === "SUBSCRIBED") {
          runLifecyclePlan({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
          break;
        }
        runLifecyclePlan({
          type: LifecycleSignalType.REALTIME_DISCONNECTED,
          status,
          believedSignedIn: Boolean(signal.believedSignedIn),
        });
        break;
      }
      default:
        if (import.meta.env?.DEV) {
          console.warn("[ConnectionLifecycleManager] unknown report signal", signal?.type);
        }
    }
  }

  const api = {
    report,

    markConnected: (reason) => report({ type: "mark_connected", reason }),
    markReconnecting: (reason) => report({ type: "mark_reconnecting", reason }),
    markExpiredSurface: (reason) => report({ type: "mark_expired_surface", reason }),
    reportRealtimeUnstable: (reason) =>
      report({ type: LifecycleSignalType.TRANSPORT_REALTIME_UNSTABLE, reason }),
    reportRealtimeRecovered: (reason) => report({ type: "report_realtime_recovered", reason }),
    reportVisibilityRecover: (reason) => report({ type: "report_visibility_recover", reason }),
    reportOffline: (reason) => report({ type: "report_offline", reason }),
    reportRefreshRequiredVisible: () => report({ type: "report_refresh_required_visible" }),
    reportRefreshStarting: (opts) =>
      report({ type: "report_refresh_starting", offline: Boolean(opts?.offline) }),
    reportRefreshOk: (reason) => report({ type: "report_refresh_ok", reason }),
    reportSessionMissingDuringReconnect: () => report({ type: "report_session_missing_during_reconnect" }),
    markManualLogoutReset: () => report({ type: "mark_manual_logout_reset" }),

    reportVisibilityState: (visibility, hiddenAt = null) => report({ type: "visibility_state", visibility, hiddenAt }),
    reportNetworkState: (online, reason) => report({ type: "network_state", online, reason }),
    reportRecoveryWake: (phase, opts = {}) =>
      report({
        type: "recovery_wake",
        phase,
        blockingMutations: opts.blockingMutations,
        reason: opts.reason,
      }),

    transitionToExpired(reason, options) {
      patch({ auth: { phase: "expired", lastReason: reason ?? null } });
      return sink.transitionToExpired(reason, options);
    },

    getDecision: (reason, extra) => sink.getDecision(reason, extra),
    shouldRequireReauth: (reason, extra) => sink.shouldRequireReauth(reason, extra),

    handleRefreshFatal(reason) {
      patch({ refresh: { phase: "fatal", lastReason: reason ?? null } });
      return sink.handleRefreshFatal(reason);
    },

    handleMissingSession(reason) {
      const escalate = sink.handleMissingSession(reason);
      patch({
        refresh: {
          phase: escalate ? "missing_escalated" : "missing_recovering",
          lastReason: reason ?? null,
        },
      });
      return escalate;
    },

    escalateRecoverableSession(reason) {
      return sink.escalateRecoverableSession(reason);
    },

    /** Observability: immutable-ish snapshot of the connection read model (no `patch` / `reset`). */
    getReadModelSnapshot: readModelSnapshot,

    /** Subscribe to read model changes (same shape as getReadModelSnapshot). @returns {() => void} unsubscribe */
    subscribeReadModel(listener) {
      return store.subscribe((state) => {
        listener({
          auth: state.auth,
          refresh: state.refresh,
          realtime: state.realtime,
          visibility: state.visibility,
          network: state.network,
          sleepWake: state.sleepWake,
          recovery: state.recovery,
        });
      });
    },

    /**
     * Drop-in for {@link registerSessionAuthority} — all calls become lifecycle-tracked reports + single Authority sink.
     */
    toSessionAuthorityAdapter() {
      return {
        markConnected: api.markConnected,
        markReconnecting: api.markReconnecting,
        markExpiredSurface: api.markExpiredSurface,
        transitionToExpired: api.transitionToExpired,
        getDecision: api.getDecision,
        shouldRequireReauth: api.shouldRequireReauth,
        handleRefreshFatal: api.handleRefreshFatal,
        handleMissingSession: api.handleMissingSession,
        escalateRecoverableSession: api.escalateRecoverableSession,
        reportRealtimeUnstable: api.reportRealtimeUnstable,
        reportRealtimeRecovered: api.reportRealtimeRecovered,
        reportVisibilityRecover: api.reportVisibilityRecover,
        reportOffline: api.reportOffline,
        reportRefreshRequiredVisible: api.reportRefreshRequiredVisible,
        reportRefreshStarting: api.reportRefreshStarting,
        reportRefreshOk: api.reportRefreshOk,
        reportSessionMissingDuringReconnect: api.reportSessionMissingDuringReconnect,
        markManualLogoutReset: api.markManualLogoutReset,
      };
    },
  };

  return api;
}
