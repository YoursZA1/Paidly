import { handleHistoricalExchangeRates } from "../_exchangeRatesShared.js";

export default async function handler(req, res) {
  return handleHistoricalExchangeRates(req, res);
}
