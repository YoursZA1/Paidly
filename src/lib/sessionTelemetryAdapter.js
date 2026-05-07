import { SESSION_TELEMETRY_EVENT } from "@/lib/sessionTelemetry";

let teardown = null;

function clampRate(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function shouldSample(sampleRate) {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

async function loadTrackFn() {
  try {
    const mod = await import("@vercel/analytics");
    return typeof mod?.track === "function" ? mod.track : null;
  } catch {
    return null;
  }
}

/**
 * Installs a lightweight browser listener for `paidly:session-telemetry` events
 * and forwards sampled events to the configured sink.
 *
 * Env controls:
 * - VITE_SESSION_TELEMETRY_ENABLED=1|true|yes (default: true)
 * - VITE_SESSION_TELEMETRY_SAMPLE_RATE=0..1 (default: 1 in dev, 0.25 in prod)
 * - VITE_SESSION_TELEMETRY_SINK=vercel|console|none (default: vercel in prod, console in dev)
 */
export async function installSessionTelemetryAdapter() {
  if (typeof window === "undefined" || teardown) return teardown || (() => {});

  const enabledRaw = String(import.meta.env.VITE_SESSION_TELEMETRY_ENABLED ?? "true").toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes";
  if (!enabled) return () => {};

  const sampleRate = clampRate(
    import.meta.env.VITE_SESSION_TELEMETRY_SAMPLE_RATE,
    import.meta.env.PROD ? 0.25 : 1
  );
  const sink = String(
    import.meta.env.VITE_SESSION_TELEMETRY_SINK ?? (import.meta.env.PROD ? "vercel" : "console")
  )
    .trim()
    .toLowerCase();

  const track = sink === "vercel" ? await loadTrackFn() : null;

  const onEvent = (evt) => {
    const detail = evt?.detail || {};
    if (!detail?.event) return;
    if (!shouldSample(sampleRate)) return;

    const payload = {
      ...detail,
      sampled: true,
      sink,
    };

    if (sink === "console") {
      console.debug("[SessionTelemetryAdapter]", payload);
      return;
    }
    if (sink === "vercel" && track) {
      // Vercel track accepts JSON payload metadata.
      track("session_telemetry", payload);
      return;
    }
  };

  window.addEventListener(SESSION_TELEMETRY_EVENT, onEvent);
  teardown = () => {
    window.removeEventListener(SESSION_TELEMETRY_EVENT, onEvent);
    teardown = null;
  };
  return teardown;
}
