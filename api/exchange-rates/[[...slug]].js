/**
 * Latest + historical exchange rates in one function (Vercel Hobby).
 * Replaces /api/exchange-rates.js, /historical, /[date] paths.
 */
import { handleLatestExchangeRates, handleHistoricalExchangeRates } from "../_exchangeRatesShared.js";

export default async function handler(req, res) {
  const raw = req.query?.slug;
  const parts = Array.isArray(raw) ? raw : raw != null && raw !== "" ? [raw] : [];

  if (parts.length === 0) {
    return handleLatestExchangeRates(req, res);
  }

  const head = String(parts[0] || "");
  if (head === "historical") {
    return handleHistoricalExchangeRates(req, res, null);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(head) && parts.length === 1) {
    return handleHistoricalExchangeRates(req, res, head);
  }

  return res.status(404).json({ error: "Not found" });
}
