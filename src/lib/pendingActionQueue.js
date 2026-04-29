let pendingAction = null;

function isFunction(value) {
  return typeof value === "function";
}

/**
 * Keep only one pending action at a time (latest wins).
 * Conservative by design to avoid replaying multiple stale requests.
 * @param {() => Promise<unknown>} action
 */
export function queuePendingAction(action) {
  if (!isFunction(action)) return;
  pendingAction = action;
}

export function hasPendingAction() {
  return isFunction(pendingAction);
}

/**
 * Run and clear the currently queued action.
 * Returns null when no queued action exists.
 */
export async function consumePendingAction() {
  if (!isFunction(pendingAction)) return null;
  const action = pendingAction;
  pendingAction = null;
  return action();
}

export function clearPendingAction() {
  pendingAction = null;
}
