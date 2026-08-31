/**
 * Numeric cash tender for the till keypad.
 * Digits enter as cents (standard POS pad). `00` multiplies by 100.
 */

export function cashTenderToCents(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function centsToCashTender(cents) {
  const n = Math.max(0, Math.trunc(Number(cents) || 0));
  return (n / 100).toFixed(2);
}

/**
 * @param {string|number} current
 * @param {string} key 0-9 | 00 | back | clear
 */
export function applyPosCashKey(current, key) {
  const k = String(key || "");
  if (k === "clear") return "0.00";
  let cents = cashTenderToCents(current);
  if (k === "back" || k === "⌫") {
    cents = Math.floor(cents / 10);
    return centsToCashTender(cents);
  }
  if (k === "00") {
    cents = Math.min(cents * 100, 99_999_999);
    return centsToCashTender(cents);
  }
  if (/^[0-9]$/.test(k)) {
    cents = Math.min(cents * 10 + Number(k), 99_999_999);
    return centsToCashTender(cents);
  }
  return centsToCashTender(cents);
}
