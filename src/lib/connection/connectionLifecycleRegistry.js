/**
 * Browser bridge for modules that need the {@link createConnectionLifecycleManager} instance.
 * AuthProvider registers on mount.
 */

let lifecycleRef = null;

/** @param {ReturnType<import('./ConnectionLifecycleManager.js').createConnectionLifecycleManager> | null} next */
export function registerConnectionLifecycleManager(next) {
  lifecycleRef = next;
}

/** @returns {ReturnType<import('./ConnectionLifecycleManager.js').createConnectionLifecycleManager> | null} */
export function getConnectionLifecycleManager() {
  return lifecycleRef;
}

/** Global auth-invalid guard for low-level modules that cannot depend on React context. */
export function isConnectionLifecycleAuthInvalid() {
  return Boolean(lifecycleRef?.isAuthInvalid?.());
}
