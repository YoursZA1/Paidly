/**
 * Paidly installability helpers.
 *
 * Sensitive data is never involved here — this only inspects display-mode / install events.
 * Safe on browsers that do not fire `beforeinstallprompt`.
 */

/** @typedef {'accepted' | 'dismissed' | 'unavailable' | 'failed'} InstallOutcome */

function hasWindow() {
  return typeof window !== "undefined";
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

function onBeforeInstallPrompt(event) {
  // Till shell has no Install control. Leave the native banner available.
  try {
    if (/^\/pos\/?$/i.test(window.location?.pathname || "")) {
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    event.preventDefault();
  } catch {
    /* older engines */
  }
  deferredPrompt = event;
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
    event.prompt();
    const choice = await event.userChoice;
    const outcome = choice?.outcome === "accepted" ? "accepted" : "dismissed";
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
