/**
 * Shared environment flag helpers (server + Vercel serverless).
 */

export function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function envNumber(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
