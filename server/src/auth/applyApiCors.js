/**
 * CORS for browser-callable /api routes on Vercel (and Express when not using cors middleware).
 * Reflects request Origin when present — required when Authorization header is sent.
 */

export function applyApiCors(
  req,
  res,
  { methods = "POST, OPTIONS", headers = "Content-Type, Authorization" } = {}
) {
  const origin = req.headers?.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", headers);
}
