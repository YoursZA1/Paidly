import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";

/**
 * @typedef {{ kind: 'patch', data: object } | { kind: 'mark_connected', reason: string } | { kind: 'report_realtime_unstable', reason: string } | { kind: 'report_visibility_recover', reason: string } | { kind: 'maybe_report_realtime_recovered' }} LifecycleStep
 */

/**
 * Build an ordered list of effects. Executor applies them in order; duplicate reconnect paths are avoided
 * (e.g. only `reportRealtimeUnstable` — SessionManager already maps that to reconnecting when policy says so).
 *
 * @param {{ type: string } & Record<string, unknown>} signal
 * @returns {{ steps: LifecycleStep[] }}
 */
export function buildLifecyclePlan(signal) {
  switch (signal.type) {
    case LifecycleSignalType.REALTIME_SUBSCRIBED: {
      const steps = [
        { kind: "patch", data: { realtime: { phase: "subscribed", lastReason: "SUBSCRIBED" } } },
        { kind: "mark_connected", reason: "sync_realtime_ready" },
        { kind: "maybe_report_realtime_recovered" },
      ];
      return { steps };
    }

    case LifecycleSignalType.REALTIME_DISCONNECTED: {
      const status = signal.status ?? "unknown";
      const visibility =
        typeof document !== "undefined" ? document.visibilityState : "visible";
      const steps = [{ kind: "patch", data: { realtime: { phase: "unstable", lastReason: String(status) } } }];

      if (!signal.believedSignedIn) {
        return { steps };
      }
      // Background / sleep: record state only; do not push session into reconnecting for socket churn.
      if (visibility === "hidden") {
        steps[0] = {
          kind: "patch",
          data: { realtime: { phase: "unstable_background", lastReason: String(status) } },
        };
        return { steps };
      }

      steps.push({ kind: "report_realtime_unstable", reason: "realtime_channel_unstable" });
      return { steps };
    }

    case LifecycleSignalType.REFRESH_SKIPPED: {
      return {
        steps: [
          {
            kind: "patch",
            data: { refresh: { phase: "skipped", lastReason: signal.reason != null ? String(signal.reason) : null } },
          },
        ],
      };
    }

    case LifecycleSignalType.REFRESH_RETRYING: {
      return {
        steps: [
          {
            kind: "patch",
            data: {
              refresh: { phase: "retrying", lastReason: signal.reason != null ? String(signal.reason) : null },
            },
          },
        ],
      };
    }

    case LifecycleSignalType.VISIBILITY_RESTORE_FAILED: {
      const steps = [
        { kind: "patch", data: { visibility: "visible", sleepWake: { phase: "awake", hiddenAt: null } } },
      ];
      if (!signal.believedSignedIn) {
        return { steps };
      }
      steps.push({
        kind: "report_visibility_recover",
        reason: String(signal.reason || "tab_visible_refresh_failed"),
      });
      return { steps };
    }

    case LifecycleSignalType.TRANSPORT_REALTIME_UNSTABLE: {
      return {
        steps: [
          {
            kind: "patch",
            data: {
              realtime: { phase: "unstable", lastReason: signal.reason != null ? String(signal.reason) : null },
            },
          },
          { kind: "report_realtime_unstable", reason: signal.reason || "realtime_unstable" },
        ],
      };
    }

    default:
      return { steps: [] };
  }
}
