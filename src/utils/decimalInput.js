/**
 * South African decimal entry: comma or dot is the decimal mark.
 * "0,01" and "0.01" are both one cent. Stored values stay dot-decimal.
 */

function stripSpaces(value) {
  return String(value).trim().replace(/[\s\u00a0]/g, "");
}

export function parseDecimalInput(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  let s = stripSpaces(raw);
  if (!s) return null;
  if (/[.,]$/.test(s)) return null;

  const negative = s.startsWith("-") || s.startsWith("−");
  s = s.replace(/^[−-]/, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const commas = s.split(",").length - 1;
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function formatDecimalNumber(value) {
  const n = typeof value === "number" ? value : parseDecimalInput(value);
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-ZA", {
    useGrouping: false,
    maximumFractionDigits: 6,
  }).format(n);
}

/** Canonical dot-decimal string for existing parseFloat handlers. */
export function decimalInputValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "string" && stripSpaces(raw) === "") return "";
  const n = parseDecimalInput(raw);
  return n == null ? null : String(n);
}
