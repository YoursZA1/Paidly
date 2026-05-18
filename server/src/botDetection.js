/**
 * Lightweight bot/automation detection for sensitive auth and public-submission routes.
 * Applied only to specific paths — does not affect webhooks, health, or authenticated API.
 *
 * Catches headless browsers (Puppeteer, Playwright, PhantomJS, Selenium) and scripted
 * clients (python-requests, curl) that hit auth endpoints. Real browsers always send a
 * non-empty User-Agent. Mobile apps go through OAuth or the Supabase JS SDK, which sets
 * a standard UA.
 */

const BOT_PATTERNS = [
  /HeadlessChrome/i,
  /PhantomJS/i,
  /Selenium/i,
  /WebDriver/i,
  /python-requests/i,
  /python-urllib/i,
  /Go-http-client/i,
  /libwww-perl/i,
  /curl\//i,
  /Wget\//i,
];

/** Routes where a missing or bot-like UA should be rejected. */
const PROTECTED_PATHS = new Set([
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/forgot-password",
  "/api/waitlist",
]);

/**
 * @param {(level: string, event: string, data: object) => void} logSecurity
 */
export function createBotDetectionMiddleware(logSecurity) {
  return (req, res, next) => {
    const path = (req.path || req.url?.split("?")[0] || "").toLowerCase();
    if (!PROTECTED_PATHS.has(path)) return next();
    if (req.method === "OPTIONS") return next();

    const ua = String(req.headers["user-agent"] || "").trim();

    if (!ua) {
      logSecurity("warn", "bot_detected_no_ua", { path, method: req.method });
      return res.status(400).json({ error: "Invalid request" });
    }

    for (const pattern of BOT_PATTERNS) {
      if (pattern.test(ua)) {
        logSecurity("warn", "bot_detected_ua", {
          path,
          method: req.method,
          ua: ua.slice(0, 120),
        });
        return res.status(400).json({ error: "Invalid request" });
      }
    }

    next();
  };
}
