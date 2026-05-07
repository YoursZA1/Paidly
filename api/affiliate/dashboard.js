import affiliatesHandler from "../affiliates/[[...slug]].js";

/**
 * Explicit compatibility route for `/api/affiliate/dashboard`.
 * Avoids rewrite-only dependency and prevents 404s when rewrite rules drift.
 */
export default async function handler(req, res) {
  req.query = { ...(req.query || {}), __affiliateDashboard: "1" };
  return affiliatesHandler(req, res);
}

