const DRAFT_PREFIX = "paidly_unsaved_draft:";

/**
 * Call before starting critical async operations (uploads/submits) to suppress idle logout.
 */
export function beginCriticalSessionOperation() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("paidly:critical-op-start"));
}

/**
 * Call in finally{} blocks when critical operations complete.
 */
export function endCriticalSessionOperation() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("paidly:critical-op-end"));
}

/**
 * Optional helper for draft persistence before logout.
 */
export function persistUnsavedDraft(draftKey, payload) {
  if (typeof window === "undefined" || !draftKey) return;
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${String(draftKey)}`,
      JSON.stringify({ at: Date.now(), payload: payload ?? null })
    );
  } catch {
    // ignore storage failures
  }
}

export function readUnsavedDraft(draftKey) {
  if (typeof window === "undefined" || !draftKey) return null;
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${String(draftKey)}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearUnsavedDraft(draftKey) {
  if (typeof window === "undefined" || !draftKey) return;
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${String(draftKey)}`);
  } catch {
    // ignore
  }
}
