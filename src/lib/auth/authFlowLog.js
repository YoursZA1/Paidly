/**
 * Stage-only auth diagnostics. Never logs tokens, passwords, secrets, or full user payloads.
 */

function isDev() {
  return Boolean(import.meta.env?.DEV);
}

function safeExtra(extra) {
  if (!extra || typeof extra !== "object") return undefined;
  const out = {};
  if (extra.stage) out.stage = String(extra.stage);
  if (extra.errorType) out.errorType = String(extra.errorType);
  if (extra.errorCode != null) out.errorCode = String(extra.errorCode);
  if (extra.status != null) out.status = Number(extra.status);
  if (extra.retry != null) out.retry = Number(extra.retry);
  if (extra.durationMs != null) out.durationMs = Number(extra.durationMs);
  if (extra.keptSession === true) out.keptSession = true;
  return Object.keys(out).length ? out : undefined;
}

export function sessionReadErrorType(error) {
  if (error == null) return "unknown";
  if (typeof error === "string") return error.slice(0, 80);
  const name = String(error.name || "").trim();
  const code = String(error.code || error.status || "").trim();
  if (name) return code ? `${name}:${code}` : name;
  if (code) return code;
  return "error";
}

/**
 * @param {"AUTH"|"PROFILE"} scope
 * @param {string} message
 * @param {{ stage?: string, errorType?: string, errorCode?: string, status?: number, retry?: number, durationMs?: number, keptSession?: boolean }} [extra]
 */
export function authFlowLog(scope, message, extra) {
  const payload = safeExtra(extra);
  const line = `[${scope}] ${message}`;
  if (extra?.errorType) {
    if (payload) console.warn(line, payload);
    else console.warn(line);
    return;
  }
  if (!isDev()) return;
  if (payload) console.info(line, payload);
  else console.info(line);
}
