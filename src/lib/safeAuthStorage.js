/**
 * Wraps a Storage implementation so corrupted Supabase GoTrue JSON blobs are removed on read.
 * Prevents getSession from failing permanently after a partial write or manual localStorage edits.
 */
export function wrapStorageWithCorruptionGuard(storage) {
  if (!storage || typeof storage.getItem !== "function") return storage;

  const isSupabaseAuthKey = (key) =>
    typeof key === "string" &&
    (key === "supabase.auth.token" || /^sb-[\w-]+-auth-token$/i.test(key));

  return {
    getItem(key) {
      try {
        const value = storage.getItem(key);
        if (value == null || value === "") return value;
        if (!isSupabaseAuthKey(key)) return value;
        try {
          const parsed = JSON.parse(value);
          if (parsed !== null && typeof parsed !== "object") {
            throw new Error("invalid shape");
          }
        } catch {
          try {
            storage.removeItem(key);
          } catch {
            /* ignore */
          }
          if (import.meta.env?.DEV) {
            console.warn("[Supabase] Removed corrupted auth storage key:", key);
          }
          return null;
        }
        return value;
      } catch {
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
        return null;
      }
    },
    setItem(key, val) {
      storage.setItem(key, val);
    },
    removeItem(key) {
      storage.removeItem(key);
    },
  };
}
