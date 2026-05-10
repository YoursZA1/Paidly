import { trackSessionTelemetry } from "@/lib/sessionTelemetry";
import { refreshRetrying, refreshSkipped } from "@/lib/session/refreshResult";

/**
 * @param {unknown} result
 * @returns {boolean}
 */
function refreshTelemetryOk(result) {
  return Boolean(result && typeof result === "object" && result.status === "success");
}

export function createRefreshQueue({ minGapMs = 3000 } = {}) {
  let inFlightPromise = null;
  let lastStartedAt = 0;
  let halted = false;

  async function enqueue(task, meta = {}) {
    if (typeof task !== "function") {
      throw new Error("RefreshQueue.enqueue requires a task function");
    }
    if (halted) {
      trackSessionTelemetry("refresh_queue_halted_skip", {
        source: meta.source || "unknown",
      });
      return refreshSkipped("queue_halted");
    }
    if (inFlightPromise) {
      trackSessionTelemetry("refresh_queue_joined", {
        source: meta.source || "unknown",
        return_retrying: Boolean(meta.returnRetryingOnJoin),
      });
      if (meta.returnRetryingOnJoin) {
        return refreshRetrying("joined_in_flight");
      }
      return inFlightPromise;
    }
    const now = Date.now();
    const bypassThrottle = Boolean(meta.bypassThrottle);
    if (!bypassThrottle && now - lastStartedAt < minGapMs) {
      trackSessionTelemetry("refresh_queue_throttled", {
        source: meta.source || "unknown",
        min_gap_ms: minGapMs,
      });
      return refreshSkipped("throttled");
    }
    lastStartedAt = now;
    trackSessionTelemetry("refresh_queue_started", {
      source: meta.source || "unknown",
    });
    inFlightPromise = (async () => {
      try {
        const result = await task();
        trackSessionTelemetry("refresh_queue_finished", {
          source: meta.source || "unknown",
          ok: refreshTelemetryOk(result),
          refresh_status: result && typeof result === "object" ? result.status : null,
        });
        return result;
      } finally {
        inFlightPromise = null;
      }
    })();
    return inFlightPromise;
  }

  function isRunning() {
    return Boolean(inFlightPromise);
  }

  function halt() {
    halted = true;
    console.info("[RetryController] Refresh queue halted.");
    trackSessionTelemetry("refresh_queue_halted", {});
  }

  function resume() {
    halted = false;
    console.info("[RetryController] Refresh queue resumed.");
    trackSessionTelemetry("refresh_queue_resumed", {});
  }

  function reset() {
    halted = false;
    lastStartedAt = 0;
    trackSessionTelemetry("refresh_queue_reset", {});
  }

  return {
    enqueue,
    isRunning,
    halt,
    resume,
    reset,
  };
}
