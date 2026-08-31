/**
 * Paidly installability helpers.
 *
 * Sensitive data is never involved here — this only inspects display-mode / install events.
 * Safe on browsers that do not fire `beforeinstallprompt`.
 */

/** @typedef {'accepted' | 'dismissed' | 'unavailable' | 'failed'} InstallOutcome */

export const PWA_INSTALL_DISMISSED_KEY = "pwa-prompt-dismissed";

function hasWindow() {
  return typeof window !== "undefined";
}

/** Till shell and POS invite/join — do not intercept the native install banner. */
export function isPosRelatedPath(pathname) {
  try {
    const p = pathname ?? (hasWindow() ? window.location?.pathname : "");
    return /^\/pos(\/|$)/i.test(String(p || ""));
  } catch {
    return false;
  }
}

export function isCustomInstallUiDismissed() {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setCustomInstallUiDismissed(dismissed) {
  if (!hasWindow()) return;
  try {
    if (dismissed) window.localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
    else window.localStorage.removeItem(PWA_INSTALL_DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Chromium logs a console error if we call preventDefault() on beforeinstallprompt
 * without an immediate user-triggered prompt(). Paidly does not intercept: the native
 * install banner / address-bar install icon remains the Chromium path.
 */
export function shouldInterceptBeforeInstallPrompt() {
  return false;
}

function matchDisplayMode(query) {
  try {
    return Boolean(hasWindow() && window.matchMedia?.(query)?.matches);
  } catch {
    return false;
  }
}

/**
 * True when Paidly is running as an installed app (standalone / iOS home screen / TWA).
 * @param {Pick<Window, 'matchMedia' | 'navigator'> & { document?: { referrer?: string } }} [env]
 */
export function isStandaloneDisplay(env = typeof window !== "undefined" ? window : undefined) {
  if (!env) return false;
  const mq = (q) => {
    try {
      return Boolean(env.matchMedia?.(q)?.matches);
    } catch {
      return false;
    }
  };
  const iosStandalone = env.navigator?.standalone === true;
  const androidTwa = typeof env.document?.referrer === "string" && env.document.referrer.startsWith("android-app://");
  return Boolean(
    mq("(display-mode: standalone)") ||
      mq("(display-mode: fullscreen)") ||
      mq("(display-mode: minimal-ui)") ||
      iosStandalone ||
      androidTwa
  );
}

/**
 * iPhone / iPad / iPod WebKit — no `beforeinstallprompt`; Share → Add to Home Screen.
 * @param {Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>} [nav]
 */
export function isIosInstallCandidate(nav = typeof navigator !== "undefined" ? navigator : undefined) {
  if (!nav) return false;
  const ua = String(nav.userAgent || "");
  const iPhoneOrPod = /iPhone|iPod/i.test(ua);
  const iPad = /iPad/i.test(ua) || (nav.platform === "MacIntel" && Number(nav.maxTouchPoints || 0) > 1);
  return iPhoneOrPod || iPad;
}

let deferredPrompt = null;
const subscribers = new Set();
let listenersAttached = false;

function emit() {
  for (const fn of subscribers) {
    try {
      fn(getInstallPromptSnapshot());
    } catch {
      /* subscriber errors must not break install detection */
    }
  }
}

function onBeforeInstallPrompt(_event) {
  // Do not call preventDefault() — that suppresses the native banner and Chrome reports:
  // "Banner not shown: beforeinstallpromptevent.preventDefault() called."
  deferredPrompt = null;
  emit();
}

function onAppInstalled() {
  deferredPrompt = null;
  emit();
}

function onDisplayModeChange() {
  emit();
}

/** Attach window listeners once. No-ops on engines without the APIs. */
export function initInstallPromptListeners() {
  if (!hasWindow() || listenersAttached) return;
  listenersAttached = true;
  try {
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  } catch {
    /* ignore */
  }
  try {
    window.addEventListener("appinstalled", onAppInstalled);
  } catch {
    /* ignore */
  }
  try {
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", onDisplayModeChange);
  } catch {
    /* ignore */
  }
}

export function subscribeInstallPrompt(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function getInstallPromptSnapshot() {
  const installed = isStandaloneDisplay();
  const ios = isIosInstallCandidate() && !installed;
  const canInstall = Boolean(deferredPrompt) && !installed;
  return {
    canInstall,
    isInstalled: installed,
    isIosInstall: ios,
    needsManualInstall: !installed && !canInstall && !ios,
  };
}

/**
 * Trigger the browser's native install UI when a deferred prompt exists.
 * @returns {Promise<{ outcome: InstallOutcome }>}
 */
export async function promptPaidlyInstall() {
  const event = deferredPrompt;
  if (!event || typeof event.prompt !== "function") {
    return { outcome: "unavailable" };
  }
  try {
    deferredPrompt = null;
    emit();
    await event.prompt();
    const choice = await event.userChoice;
    const outcome = choice?.outcome === "accepted" ? "accepted" : "dismissed";
    if (outcome === "dismissed") setCustomInstallUiDismissed(true);
    return { outcome };
  } catch {
    return { outcome: "failed" };
  }
}

/** Test-only: reset module state. */
export function __resetInstallPromptForTests() {
  deferredPrompt = null;
  subscribers.clear();
  listenersAttached = false;
}

/** Test-only: inject a fake deferred prompt. */
export function __setDeferredPromptForTests(event) {
  deferredPrompt = event;
  emit();
}

export { matchDisplayMode };
