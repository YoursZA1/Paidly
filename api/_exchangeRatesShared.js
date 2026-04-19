const EXCHANGE_RATE_API_BASE_URL = "https://api.exchangerate-api.com/v4";

function normalizeBaseCurrency(raw) {
  const base = String(raw || "ZAR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return "ZAR";
  return base;
}

function normalizeIsoDate(raw) {
  const date = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function setCors(res) {
  const origin = res?.req?.headers?.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function fetchLatestRates(base) {
  const url = `${EXCHANGE_RATE_API_BASE_URL}/latest/${encodeURIComponent(base)}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Exchange provider error (${response.status}): ${text || response.statusText}`);
  }

  const json = await response.json();
  return {
    provider: "exchangerate-api",
    base: json?.base || base,
    date: json?.date || null,
    rates: json?.rates && typeof json.rates === "object" ? json.rates : {},
  };
}

export async function handleLatestExchangeRates(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const base = normalizeBaseCurrency(req.query?.base);
  try {
    const payload = await fetchLatestRates(base);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({
      error: "Exchange rates unavailable",
      detail: error?.message || String(error),
      base,
      rates: {},
    });
  }
}

export async function handleHistoricalExchangeRates(req, res, rawDate) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const base = normalizeBaseCurrency(req.query?.base);
  const dateCandidate = rawDate || req.query?.date;
  const date = normalizeIsoDate(dateCandidate);
  if (!date) {
    return res.status(400).json({ error: "Invalid date. Expected YYYY-MM-DD." });
  }

  try {
    // exchangerate-api sample endpoint only guarantees latest rates.
    // Keep the historical route shape for frontend compatibility.
    const payload = await fetchLatestRates(base);
    return res.status(200).json({
      ...payload,
      requested_date: date,
      historical: false,
      note: "Provider endpoint returns latest rates for this route.",
    });
  } catch (error) {
    return res.status(502).json({
      error: "Historical exchange rates unavailable",
      detail: error?.message || String(error),
      base,
      date,
      rates: {},
    });
  }
}
