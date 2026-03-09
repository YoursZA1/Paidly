


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

export function createAdminPageUrl(pageName: string) {
    return '/admin/' + pageName.toLowerCase().replace(/ /g, '-');
}