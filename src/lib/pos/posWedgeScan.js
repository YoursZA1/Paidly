/**
 * USB/Bluetooth barcode scanners act as keyboards: a rapid burst of characters + Enter.
 * Compare codes as strings — never Number() — so leading zeros stay intact.
 */

export const POS_WEDGE_RESET_MS = 50;
export const POS_WEDGE_MIN_LEN = 4;
export const POS_SCAN_RAPID_MS = 50;
export const POS_SCAN_COMMIT_MS = 40;

export function createPosWedgeBuffer({ resetMs = POS_WEDGE_RESET_MS, minLen = POS_WEDGE_MIN_LEN } = {}) {
  let buffer = "";
  let lastAt = 0;

  return {
    reset() {
      buffer = "";
      lastAt = 0;
    },
    push(key, now = Date.now()) {
      if (now - lastAt > resetMs) buffer = "";
      lastAt = now;
      if (key === "Enter" || key === "Tab") {
        const code = buffer;
        buffer = "";
        return code.length >= minLen ? code : null;
      }
      if (typeof key === "string" && key.length === 1) {
        buffer += key;
      }
      return null;
    },
    value() {
      return buffer;
    },
  };
}

export function isRapidScanGap(gapMs, threshold = POS_SCAN_RAPID_MS) {
  return gapMs > 0 && gapMs < threshold;
}
