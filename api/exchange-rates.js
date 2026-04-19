import { handleLatestExchangeRates } from "./_exchangeRatesShared.js";

export default async function handler(req, res) {
  return handleLatestExchangeRates(req, res);
}
