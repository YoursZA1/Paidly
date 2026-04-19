import { handleHistoricalExchangeRates } from "../_exchangeRatesShared.js";

export default async function handler(req, res) {
  const date = req.query?.date;
  return handleHistoricalExchangeRates(req, res, date);
}
