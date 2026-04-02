/**
 * Browser globals: unhandled promise rejections, lazy-route / chunk load failures, Vite preload errors.
 * Stale deploys often break dynamic import(); we reload once via sessionStorage (same key as legacy inline handler).
 */
import { getCurrentPage, logUnhandledError } from '@/utils/apiLogger';

const RELOAD_ONCE_KEY = 'paidly_preload_reload_once';

/** @returns {boolean} true if a reload was triggered */
export function tryReloadOnceForStaleAssets() {
  try {
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1') return false;
    sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
  } catch {
    /* sessionStorage blocked — still attempt reload */
  }
  window.location.reload();
  return true;
}

// Vite/React lazy routes, webpack-style names, minified chunk URLs
const CHUNK_FAILURE_RE =
  /dynamically imported module|Loading chunk|ChunkLoadError|import\s+failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/**
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isLikelyStaleChunkFailure(reason) {
  if (reason == null) return false;
  if (typeof reason === 'string') return CHUNK_FAILURE_RE.test(reason);
  if (reason instanceof Error) {
    if (reason.name === 'ChunkLoadError') return true;
    return CHUNK_FAILURE_RE.test(String(reason.message || ''));
  }
  try {
    return CHUNK_FAILURE_RE.test(JSON.stringify(reason));
  } catch {
    return CHUNK_FAILURE_RE.test(String(reason));
  }
}

const RESIZE_OBSERVER_LOOP_RE =
  /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)/i;

function logUnhandledRejection(reason) {
  const page = getCurrentPage();
  if (reason instanceof Error) {
    logUnhandledError(reason, page);
    return;
  }
  const msg = typeof reason === 'string' ? reason : String(reason);
  console.error(`[Paidly] UNHANDLED_REJECTION | page=${page} | ${msg}`, reason);
}

/** Dispatched so the root error boundary can show the same full-page UI as render errors (boundaries do not catch promises). */
export const PAIDLY_APPLICATION_ERROR_EVENT = 'paidly:application-error';

/**
 * Coerce `reason` to an `Error` and dispatch `PAIDLY_APPLICATION_ERROR_EVENT` so the root
 * error boundary renders the same full-page error UI as a render crash.
 * No-op on the server. Prefer `throw` in sync/React paths when possible; use this to surface an
 * async failure as a full-page error without relying on an unhandled rejection.
 *
 * @example
 * import { reportApplicationErrorFromRejection } from '@/utils/globalAsyncErrorHandlers';
 * reportApplicationErrorFromRejection(someReason);
 *
 * @param {unknown} reason
 */
export function reportApplicationErrorFromRejection(reason) {
  if (typeof window === 'undefined') return;
  let error;
  if (reason instanceof Error) {
    error = reason;
  } else {
    const msg =
      typeof reason === 'string' ? reason : String(reason ?? 'Unhandled promise rejection');
    error = new Error(msg);
  }
  window.dispatchEvent(
    new CustomEvent(PAIDLY_APPLICATION_ERROR_EVENT, { detail: { error } })
  );
}

/**
 * Register window listeners. Safe to call once from main.jsx (client only).
 */
export function installGlobalAsyncErrorHandlers() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    tryReloadOnceForStaleAssets();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const { reason } = event;

    if (isLikelyStaleChunkFailure(reason)) {
      logUnhandledRejection(reason);
      event.preventDefault();
      tryReloadOnceForStaleAssets();
      return;
    }

    logUnhandledRejection(reason);
    event.preventDefault();
    reportApplicationErrorFromRejection(reason);
  });

  window.addEventListener(
    'error',
    (event) => {
      if (RESIZE_OBSERVER_LOOP_RE.test(String(event?.message || ''))) {
        event.stopImmediatePropagation();
        return;
      }

      const t = event.target;
      if (t && t.nodeName === 'SCRIPT' && typeof t.src === 'string') {
        const src = t.src;
        if (src && /\/assets\/|\/chunk|\.js(?:\?|$)/i.test(src)) {
          tryReloadOnceForStaleAssets();
        }
      }
    },
    true
  );
}
