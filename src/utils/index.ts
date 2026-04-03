


/**
 * Triggers a short vibration on supported mobile devices (Vibration API).
 * Use on tap/press for haptic feedback; no-op when vibrate is not available.
 * @param ms Duration in milliseconds (e.g. 12 for a light "click" feel)
 */
export function triggerHaptic(ms = 12) {
  if (typeof window !== "undefined" && window.navigator?.vibrate) {
    window.navigator.vibrate(ms);
  }
}

/** Canonical route paths (PascalCase). Use for Links; router has lowercase aliases. */
export function createPageUrl(pageName: string) {
    const slug = pageName.replace(/\s+/g, '');
    return '/' + (slug.charAt(0).toUpperCase() + slug.slice(1));
}

/** Canonical document view: /ViewDocument/quote/:id or /ViewDocument/invoice/:id */
export function createViewDocumentUrl(docType: 'invoice' | 'quote', id: string) {
    const d = docType === 'invoice' ? 'invoice' : 'quote';
    return `${createPageUrl('ViewDocument')}/${d}/${encodeURIComponent(id)}`;
}

/** Marketing signup URL; `#sign-up` scrolls to the create-account card on the Signup page. */
export function createSignupUrl(): string {
    return `${createPageUrl("Signup")}#sign-up`;
}

/**
 * Affiliate share link: `?ref=` in the query (parsed by the SPA) + `#sign-up` to scroll to the form.
 * Must stay aligned with `buildAffiliateSignupShareUrl` in `server/src/affiliateShareLink.js`.
 * @param referralCode Raw code (not URL-encoded)
 * @param origin Optional base, e.g. from `VITE_APP_URL` or `window.location.origin` (no trailing slash)
 */
export function createAffiliateSignupShareUrl(referralCode: string, origin?: string): string {
    const o = String(origin ?? (typeof window !== "undefined" ? window.location.origin : ""))
        .trim()
        .replace(/\/$/, "");
    const raw = String(referralCode || "").trim();
    const signup = createPageUrl("Signup");
    if (!raw) {
        const path = `${signup}#sign-up`;
        return o ? `${o}${path}` : path;
    }
    const code = encodeURIComponent(raw);
    const path = `${signup}?ref=${code}#sign-up`;
    return o ? `${o}${path}` : path;
}

/** Waitlist section on the marketing home page. */
export function createWaitlistUrl(): string {
    return `${createPageUrl("Home")}#waitlist`;
}

export {
    AFFILIATE_LANDING_PATH,
    AFFILIATE_APPLY_PATH,
    AFFILIATE_DASHBOARD_PATH,
} from "./affiliatePaths";

/** Canonical URL for the in-app affiliate program dashboard */
export function createAffiliateDashboardUrl(): string {
    return "/dashboard/affiliate";
}

/** Public affiliate program landing (apply) */
export function createAffiliateLandingUrl(): string {
    return "/affiliate";
}

/** Public affiliate application form */
export function createAffiliateApplyUrl(): string {
    return "/affiliate/apply";
}

/**
 * When sign-in runs on a different origin than the dashboard (e.g. legacy split marketing vs app hosts),
 * set VITE_APP_URL to the dashboard origin. With a single deployment on https://www.paidly.co.za, leave unset
 * so redirects stay same-origin (vercel.json still 308s legacy app.* / apex → www).
 */
export function getAppDashboardUrl(): string {
    const base = (import.meta.env.VITE_APP_URL || '').toString().replace(/\/$/, '');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const appOrigin = base || origin;
    return appOrigin + createPageUrl('Dashboard');
}

/**
 * Origin to use for OAuth redirect (Google, etc.).
 * Use VITE_APP_URL when set (e.g. production) so callback lands on the app domain;
 * otherwise use current origin (e.g. http://localhost:5173 in dev).
 * This value must be allowlisted in Supabase: Authentication → URL Configuration → Redirect URLs.
 */
export function getOAuthRedirectOrigin(): string {
    if (typeof window === 'undefined') return '';
    const appUrl = (import.meta.env.VITE_APP_URL || '').toString().trim();
    try {
        if (appUrl) return new URL(appUrl).origin;
    } catch {
        // ignore
    }
    return window.location.origin;
}

/**
 * Settings → Subscription → "Manage Billing & Invoices".
 * Use `VITE_STRIPE_BILLING_PORTAL` for an external portal (e.g. Stripe Customer Portal URL).
 * Otherwise same origin as the deployed app (`VITE_APP_URL` or `window.location.origin`), not a hardcoded marketing domain.
 */
export function getBillingPortalUrl(): string {
    const portal = (import.meta.env.VITE_STRIPE_BILLING_PORTAL || '').toString().trim();
    if (portal) return portal;
    const appUrl = (import.meta.env.VITE_APP_URL || '').toString().trim();
    if (appUrl) {
        try {
            return new URL(appUrl).origin;
        } catch {
            // ignore
        }
    }
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return '';
}

/** True when we should send the user to the app domain after login/signup (e.g. signed in on www → go to app). */
export function shouldRedirectToAppAfterAuth(): boolean {
    const appUrl = (import.meta.env.VITE_APP_URL || '').toString().trim();
    if (!appUrl || typeof window === 'undefined') return false;
    try {
        const appOrigin = new URL(appUrl).origin;
        return window.location.origin !== appOrigin;
    } catch {
        return false;
    }
}

const WELCOME_TOUR_ELIGIBLE_PREFIX = 'paidly_welcome_tour_eligible_';

/** Call once after successful email/password signup (before redirect to the app). */
export function setWelcomeTourEligibleAfterSignup(userId: string | null | undefined) {
    if (!userId || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(WELCOME_TOUR_ELIGIBLE_PREFIX + userId, '1');
    } catch {
        /* ignore */
    }
}

export function isWelcomeTourEligible(userId: string | null | undefined): boolean {
    if (!userId || typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(WELCOME_TOUR_ELIGIBLE_PREFIX + userId) === '1';
    } catch {
        return false;
    }
}

export function clearWelcomeTourEligible(userId: string | null | undefined) {
    if (!userId || typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(WELCOME_TOUR_ELIGIBLE_PREFIX + userId);
    } catch {
        /* ignore */
    }
}

export function createAdminPageUrl(pageName: string) {
    return '/admin/' + pageName.toLowerCase().replace(/ /g, '-');
}