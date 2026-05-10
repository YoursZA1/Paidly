import { WAKE_RECOVERY_THRESHOLD_MS } from "@/stores/wakeRecoveryStore";

/**
 * @param {{ lastHeartbeatAt: number | null, hiddenAtMs: number | null, now?: number }} args
 * @returns {boolean}
 */
export function shouldEnterWakeRecoveryMode({ lastHeartbeatAt, hiddenAtMs, now = Date.now() }) {
  if (!lastHeartbeatAt || lastHeartbeatAt <= 0) return false;
  if (now - lastHeartbeatAt > WAKE_RECOVERY_THRESHOLD_MS) return true;
  if (hiddenAtMs && now - hiddenAtMs > WAKE_RECOVERY_THRESHOLD_MS) return true;
  return false;
}
