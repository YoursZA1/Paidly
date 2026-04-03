/**
 * Public signup URL with referral in the query string (React Router reads `location.search`)
 * and `#sign-up` to scroll to the form.
 *
 * Keep in sync with `createAffiliateSignupShareUrl` in `src/utils/index.ts` (path shape).
 *
 * @param {string} origin No trailing slash; e.g. https://www.paidly.co.za
 * @param {string} referralCode
 */
export function buildAffiliateSignupShareUrl(origin, referralCode) {
  const base = String(origin || "").replace(/\/$/, "");
  const raw = String(referralCode || "").trim();
  if (!raw) {
    const fallback = `/Signup#sign-up`;
    return base ? `${base}${fallback}` : fallback;
  }
  const code = encodeURIComponent(raw);
  const path = `/Signup?ref=${code}#sign-up`;
  return base ? `${base}${path}` : path;
}

function headerString(headers, name) {
  if (!headers) return "";
  const v = headers[name];
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return String(s || "").trim();
}

/**
 * Origin for user-facing links in emails. Prefer env when the API runs on a different host
 * (e.g. api.*) than the SPA (www.*).
 *
 * @param {import("http").IncomingMessage | { headers?: Record<string, string | string[] | undefined> }} req
 */
export function resolvePublicAppOriginForShareLinks(req) {
  const pub = String(process.env.PUBLIC_APP_ORIGIN || "").trim().replace(/\/$/, "");
  if (pub && /^https?:\/\//i.test(pub)) return pub;

  const clientRaw = String(process.env.CLIENT_ORIGIN || "").trim();
  if (clientRaw) {
    const first = clientRaw.split(",")[0].trim().replace(/\/$/, "");
    if (first && /^https?:\/\//i.test(first)) return first;
  }

  const headers = req?.headers;
  if (headers) {
    const proto = headerString(headers, "x-forwarded-proto") || "https";
    const host =
      headerString(headers, "x-forwarded-host") || headerString(headers, "host");
    if (host) return `${proto}://${host}`.replace(/\/$/, "");
  }
  return "";
}
