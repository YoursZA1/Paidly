import { clearSessionOrgIdCache } from "@/api/auth/orgCache.js";
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { resetPaidlyRealtimeForUserRecovery } from "@/lib/realtime/paidlyRealtimeManager";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";

/**
 * Wake-from-sleep / visibility recovery pipeline — single orchestration surface.
 * Terminal auth (EXPIRED) is owned by {@link ConnectionLifecycleManager} / session authority, not this module.
 *
 * @see docs/SESSION_RUNTIME_GUARDS.md
 */

export const WakeRecoveryState = Object.freeze({
  IDLE: "IDLE",
  RECOVERING: "RECOVERING",
  AUTH_RESTORING: "AUTH_RESTORING",
  REALTIME_RESTORING: "REALTIME_RESTORING",
  RESYNCING: "RESYNCING",
  RECOVERED: "RECOVERED",
  FAILED: "FAILED",
});

/** @typedef {'SESSION_INVALID'|'REFRESH_FAILED'|'REALTIME_FAILED'|'UNKNOWN'} WakeRecoveryFailureReasonValue */

export const WakeRecoveryFailureReason = Object.freeze({
  SESSION_INVALID: "SESSION_INVALID",
  REFRESH_FAILED: "REFRESH_FAILED",
  REALTIME_FAILED: "REALTIME_FAILED",
  UNKNOWN: "UNKNOWN",
});

/**
 * Explicit outcome for {@link runWakeRecoveryPipeline} (no string `phase` drift).
 *
 * @typedef {{ ok: true }} WakeRecoverySuccess
 * @typedef {{ ok: false, reason: WakeRecoveryFailureReasonValue }} WakeRecoveryFailure
 * @typedef {WakeRecoverySuccess | WakeRecoveryFailure} WakeRecoveryResult
 */

function setPipelineState(state) {
  useWakeRecoveryStore.setState({ pipelineState: state });
}

/**
 * Invalidate high-value workspace caches after wake so UI does not stay stale.
 */
export function invalidateWakeRecoveryWorkspaceQueries() {
  const qc = getOrCreateAppQueryClient();
  const roots = [
    "invoices",
    "invoice",
    "clients",
    "quotes",
    "cashflow-page",
    "dashboard",
    "dashboard-invoices",
    "dashboard-payslips",
    "payslips",
    "admin-settings",
  ];
  for (const key of roots) {
    qc.invalidateQueries({ queryKey: [key], exact: false });
  }
}

/**
 * @typedef {object} WakeRecoveryPipelineCtx
 * @property {string} reason
 * @property {() => void} [onPipelineState]
 * @property {(opts?: object) => Promise<import('@/lib/session/refreshResult').RefreshResult>} refreshSession
 * @property {() => Promise<object|null>} readSessionSafe
 * @property {(s: object|null) => boolean} isSessionValid
 * @property {(p: object) => void} patchAuthSession
 * @property {(phase: string) => void} setRecoveryPhase
 * @property {(reason: string, opts?: object) => Promise<void>} awaitRealtimeRecovery
 * @property {() => Promise<void>} refreshUser
 * @property {() => Promise<void>} enforceRouteInvariant
 * @property {() => boolean} [isCircuitOpen]
 * @property {{ markConnected: (r?: string) => void, markReconnecting: (r?: string) => void, reportSessionMissingDuringReconnect: () => void }} connectionLifecycle
 * @property {(opts?: object) => void} requestSessionRefresh
 * @property {(sessionNorm: object) => void} touchHeartbeatIfValid
 */

/**
 * Run wake recovery steps (caller owns UI lock / lifecycle recovery_wake signals).
 *
 * @param {WakeRecoveryPipelineCtx} ctx
 * @returns {Promise<WakeRecoveryResult>}
 */
export async function runWakeRecoveryPipeline(ctx) {
  const reason = ctx.reason || "wake";
  const circuitOpen = () => Boolean(ctx.isCircuitOpen?.());
  console.info("[Session] WakeRecoveryPipeline start", { reason });

  setPipelineState(WakeRecoveryState.RECOVERING);

  try {
    setPipelineState(WakeRecoveryState.AUTH_RESTORING);
    ctx.setRecoveryPhase?.("auth");

    const refreshResult = await ctx.refreshSession({
      silent: false,
      bypassThrottle: true,
      source: "wake_recovery",
    });

    if (refreshResult && typeof refreshResult === "object" && refreshResult.status === "fatal") {
      console.warn("[Session] WakeRecoveryPipeline auth fatal (authority handles terminal state)", {
        reason,
      });
      setPipelineState(WakeRecoveryState.FAILED);
      return { ok: false, reason: WakeRecoveryFailureReason.REFRESH_FAILED };
    }
    if (circuitOpen()) {
      setPipelineState(WakeRecoveryState.FAILED);
      return { ok: false, reason: WakeRecoveryFailureReason.REFRESH_FAILED };
    }

    const s = await ctx.readSessionSafe(true);
    if (!s?.user || !ctx.isSessionValid(s)) {
      console.warn("[Session] WakeRecoveryPipeline session missing after refresh — reporting reconnect (no terminal from pipeline)", {
        reason,
        believedSignedIn: true,
      });
      ctx.connectionLifecycle.markReconnecting("wake_recovery_session_missing");
      ctx.connectionLifecycle.reportSessionMissingDuringReconnect();
      if (!circuitOpen()) {
        ctx.requestSessionRefresh?.({
          source: "wake_recovery_followup",
          silent: false,
          debounceMs: 0,
          bypassThrottle: true,
        });
      }
      return { ok: false, reason: WakeRecoveryFailureReason.SESSION_INVALID };
    }

    ctx.patchAuthSession({ session: s });

    setPipelineState(WakeRecoveryState.REALTIME_RESTORING);
    ctx.setRecoveryPhase?.("realtime");
    resetPaidlyRealtimeForUserRecovery("wake_recovery");
    try {
      await ctx.awaitRealtimeRecovery(reason, { channelJoinTimeoutMs: 12_000 });
    } catch (reErr) {
      console.warn("[Session] WakeRecoveryPipeline realtime step failed", reErr?.message || reErr);
      resetPaidlyRealtimeForUserRecovery("wake_recovery_retry");
      setPipelineState(WakeRecoveryState.FAILED);
      if (!circuitOpen()) {
        ctx.requestSessionRefresh?.({
          source: "wake_recovery_realtime_error",
          silent: true,
          debounceMs: 0,
          bypassThrottle: true,
        });
      }
      return { ok: false, reason: WakeRecoveryFailureReason.REALTIME_FAILED };
    }
    if (circuitOpen()) {
      setPipelineState(WakeRecoveryState.FAILED);
      return { ok: false, reason: WakeRecoveryFailureReason.REFRESH_FAILED };
    }

    setPipelineState(WakeRecoveryState.RESYNCING);
    ctx.setRecoveryPhase?.("resync");
    await ctx.refreshUser();
    clearSessionOrgIdCache();
    invalidateWakeRecoveryWorkspaceQueries();
    await ctx.enforceRouteInvariant();

    ctx.connectionLifecycle.markConnected("wake_recovery");
    ctx.touchHeartbeatIfValid?.(s);

    console.info("[Session] WakeRecoveryPipeline recovered", { reason });
    return { ok: true };
  } catch (e) {
    console.warn("[Session] WakeRecoveryPipeline failed", e?.message || e);
    setPipelineState(WakeRecoveryState.FAILED);
    if (!circuitOpen()) {
      ctx.requestSessionRefresh?.({
        source: "wake_recovery_error",
        silent: true,
        debounceMs: 0,
        bypassThrottle: true,
      });
    }
    return { ok: false, reason: WakeRecoveryFailureReason.UNKNOWN };
  } finally {
    setPipelineState(WakeRecoveryState.IDLE);
  }
}
