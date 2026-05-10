/**
 * Browser-only bridge for non-React modules (e.g. customClient) to reach session mutations.
 * AuthProvider registers `ConnectionLifecycleManager.toSessionAuthorityAdapter()` so calls are
 * lifecycle-tracked before they reach `SessionOrchestrator.Authority`.
 */

let authorityRef = null;

/** @param {object | null} next — `SessionOrchestrator.Authority` */
export function registerSessionAuthority(next) {
  authorityRef = next;
}

/** @returns {object | null} */
export function getSessionAuthority() {
  return authorityRef;
}
