


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

/**
 * When the main site (e.g. www.paidly.co.za) and app (e.g. app.paidly.co.za) share the same DB,
 * set VITE_APP_URL=https://app.paidly.co.za on the main site build so sign-in/sign-up redirect to the app dashboard.
 */
export function getAppDashboardUrl(): string {
    const base = (import.meta.env.VITE_APP_URL || '').toString().replace(/\/$/, '');
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const appOrigin = base || origin;
    return appOrigin + createPageUrl('Dashboard');
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