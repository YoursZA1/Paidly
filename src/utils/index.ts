


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
    if (slug.toLowerCase() === "pos") return "/pos";
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

/** Waitlist section on the marketing home page. */
export function createWaitlistUrl(): string {
    return `${createPageUrl("Home")}#waitlist`;
}

export {
    getAppDashboardUrl,
    getBillingPortalUrl,
    getOAuthRedirectOrigin,
    resolvePaidlyAppOrigin,
    shouldRedirectToAppAfterAuth,
} from "@/lib/appOrigin";

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

const QUICK_SETUP_ELIGIBLE_PREFIX = 'paidly_quick_setup_eligible_';

/** One-time quick setup modal (Fast Activation) after email/password signup — not for returning logins. */
export function setQuickSetupEligibleAfterSignup(userId: string | null | undefined) {
    if (!userId || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(QUICK_SETUP_ELIGIBLE_PREFIX + userId, '1');
    } catch {
        /* ignore */
    }
}

export function isQuickSetupEligible(userId: string | null | undefined): boolean {
    if (!userId || typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(QUICK_SETUP_ELIGIBLE_PREFIX + userId) === '1';
    } catch {
        return false;
    }
}

export function clearQuickSetupEligible(userId: string | null | undefined) {
    if (!userId || typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(QUICK_SETUP_ELIGIBLE_PREFIX + userId);
    } catch {
        /* ignore */
    }
}

export function createAdminPageUrl(pageName: string) {
    return '/admin/' + pageName.toLowerCase().replace(/ /g, '-');
}
