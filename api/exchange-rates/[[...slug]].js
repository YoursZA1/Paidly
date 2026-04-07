import { applyPaidlyServerlessCors } from "../../../server/src/vercelPaidlyCors.js";

/**
 * Lightweight compatibility endpoint to avoid client 404s when optional FX service is unavailable.
 * Returns empty rates payload (client already handles this fallback).
 */
export default async function handler(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "GET, OPTIONS" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const base = String(req.query?.base || "ZAR").toUpperCase();
  const slug = req.query?.slug;
  const first = Array.isArray(slug) ? slug[0] : slug;

  // /api/exchange-rates/historical or /api/exchange-rates/:date both return safe empty object shape.
  if (first && first !== "historical") {
    return res.status(200).json({ base, date: String(first), rates: {} });
  }
  return res.status(200).json({ base, rates: {} });
}
