/**
 * Share-token → server-issued viewer token for public payslips (localStorage for PDF tab).
 */
const KEY = "paidly_pub_payslip_viewers_v1";

/** Remove legacy per-payslip sessionStorage keys from older builds. */
export function clearLegacyPayslipVerificationSessionKeys() {
  try {
    if (typeof sessionStorage === "undefined") return;
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && /^payslip_[^_]+_verified_email$/i.test(k)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

function readMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function getPublicPayslipViewerToken(shareToken) {
  if (!shareToken) return null;
  const t = String(shareToken).trim();
  const map = readMap();
  const v = map[t];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function setPublicPayslipViewerToken(shareToken, viewerToken) {
  if (!shareToken || !viewerToken) return;
  const map = readMap();
  map[String(shareToken).trim()] = String(viewerToken).trim();
  writeMap(map);
}
