


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

/** Marketing signup URL; `#sign-up` scrolls to the create-account card on the Signup page. */
export function createSignupUrl(): string {
    return `${createPageUrl("Signup")}#sign-up`;
}

/** Waitlist section on the marketing home page. */
export function createWaitlistUrl(): string {
    return `${createPageUrl("Home")}#waitlist`;
}

/**
 * When the main site (e.g. www.paidly.co.za) and app share the same DB,
 * set VITE_APP_URL to your canonical app origin on the marketing build (e.g. https://www.app.paidly.co.za) so post-login redirects match where users land (see vercel.json host redirect app → www.app).
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

export function createAdminPageUrl(pageName: string) {
    return '/admin/' + pageName.toLowerCase().replace(/ /g, '-');
}