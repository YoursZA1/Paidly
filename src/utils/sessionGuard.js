/**
 * When Supabase session is cleared (sign-out, invalid refresh), only redirect to login
 * from routes that are not public/marketing/auth recovery.
 */

const PUBLIC_PATH_PATTERNS = [
  /^\/login$/i,
  /^\/auth/i,
  /^\/signup/i,
  /^\/home/i,
  /^\/forgotpassword/i,
  /^\/resetpassword/i,
  /^\/acceptinvite/i,
  /^\/publicinvoice/i,
  /^\/publicquote/i,
  /^\/publicpayslip/i,
  /^\/view\//i,
  /^\/clientportal/i,
  /^\/invoicepdf/i,
  /^\/quotepdf/i,
  /^\/payslippdf/i,
  /^\/cashflowpdf/i,
  /^\/reportpdf/i,
  /^\/privacypolicy/i,
  /^\/privacy-policy/i,
  /^\/terms/i,
];

/**
 * @param {string} pathname - window.location.pathname
 * @returns {boolean} true if user may view this path without a Supabase session
 */
export function isPathAllowedWithoutSession(pathname) {
  const p = pathname || "";
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(p));
}

/**
 * Full page navigation to login when session is lost on a protected route.
 */
export function redirectToLoginIfProtectedPath() {
  if (typeof window === "undefined") return;
  if (isPathAllowedWithoutSession(window.location.pathname)) return;
  window.location.assign("/login");
}
