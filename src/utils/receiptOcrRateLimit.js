/**
 * Limits receipt scan / OCR attempts per browser tab (browser OCR and uploads are CPU/network heavy).
 */
const KEY = "paidly_receipt_scan_window";
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SCANS = 24;

export function getReceiptScanThrottleState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { blocked: false, count: 0 };
    const data = JSON.parse(raw);
    if (!data || typeof data.count !== "number" || typeof data.windowEnd !== "number") {
      return { blocked: false, count: 0 };
    }
    if (Date.now() > data.windowEnd) {
      sessionStorage.removeItem(KEY);
      return { blocked: false, count: 0 };
    }
    if (data.count >= MAX_SCANS) {
      return { blocked: true, retryAfterMs: Math.max(0, data.windowEnd - Date.now()) };
    }
    return { blocked: false, count: data.count };
  } catch {
    return { blocked: false, count: 0 };
  }
}

export function recordReceiptScanAttempt() {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(KEY);
    let count = 1;
    let windowEnd = now + WINDOW_MS;
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.count === "number" && typeof data.windowEnd === "number" && now <= data.windowEnd) {
        count = data.count + 1;
        windowEnd = data.windowEnd;
      }
    }
    sessionStorage.setItem(KEY, JSON.stringify({ count, windowEnd }));
  } catch {
    // ignore
  }
}
