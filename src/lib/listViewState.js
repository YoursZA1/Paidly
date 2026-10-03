/**
 * List pages: a finished request with zero rows is an empty state.
 * "Could not load…" is only for a request that actually failed.
 *
 * @param {{ loading?: boolean, error?: unknown, count?: number }} state
 * @returns {"loading" | "error" | "empty" | "ready"}
 */
export function resolveListViewState({ loading = false, error = null, count = 0 } = {}) {
  if (loading) return "loading";
  if (error) return "error";
  if (!count) return "empty";
  return "ready";
}
