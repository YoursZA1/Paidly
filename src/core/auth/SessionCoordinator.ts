/**
 * Single authority for supabase.auth.getSession() reads across the app.
 *
 * Problem: SyncEngine, ConnectionMonitor, and AuthContext independently called
 * getSession() on tab focus / realtime events, issuing 3-5 concurrent reads in
 * the same JS turn — redundant work and potential refresh-token contention.
 *
 * Solution:
 * 1. Fast path: authSessionStore holds the normalized session in memory with an
 *    expiry timestamp. If it has >30s to live, return it synchronously without
 *    touching Supabase.
 * 2. Snapshot cache (5s): one supabase.auth.getSession() result shared by all
 *    concurrent callers within that window.
 * 3. Single-flight: if a getSession() call is already in flight, join it instead
 *    of starting a second one.
 *
 * Allowed direct `supabase.auth.getSession()` call sites (populate / refresh authority):
 * - This module
 * - AuthContext.impl.jsx (bootstrap / refresh pipeline)
 * - SupabaseAuthService.js
 * - supabaseAuthRefresh.js
 * Prefer {@link getStableSession} / {@link getStableSessionResult} everywhere else.
 */

import { supabase } from "@/lib/supabaseClient";
import { useAuthSessionStore } from "@/stores/authSessionStore";

const SNAPSHOT_TTL_MS = 5_000;
/** Minimum seconds remaining before expiry to trust the in-memory session */
const STORE_SESSION_MIN_TTL_S = 30;

type RawSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: { id: string };
} | null;

type Snapshot = {
  session: RawSession;
  error: Error | null;
  fetchedAt: number;
};

let _cached: Snapshot | null = null;
let _inflight: Promise<Snapshot> | null = null;

function _storeSession() {
  return useAuthSessionStore.getState().session;
}

function _isStoreSessionFresh(s: ReturnType<typeof _storeSession>): boolean {
  if (!s?.expiresAt || !s?.user?.id) return false;
  const nowS = Math.floor(Date.now() / 1000);
  return s.expiresAt > nowS + STORE_SESSION_MIN_TTL_S;
}

function _fromStore(stored: NonNullable<ReturnType<typeof _storeSession>>): RawSession {
  return {
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expires_at: stored.expiresAt,
    user: stored.user,
  } as RawSession;
}

/**
 * Full getSession-shaped result (for call sites that check `error` separately).
 */
export async function getStableSessionResult(): Promise<{
  data: { session: RawSession };
  error: Error | null;
}> {
  const stored = _storeSession();
  if (_isStoreSessionFresh(stored)) {
    return { data: { session: _fromStore(stored!) }, error: null };
  }

  if (_cached && Date.now() - _cached.fetchedAt < SNAPSHOT_TTL_MS) {
    return { data: { session: _cached.session }, error: _cached.error };
  }

  if (_inflight) {
    const snap = await _inflight;
    return { data: { session: snap.session }, error: snap.error };
  }

  _inflight = (async (): Promise<Snapshot> => {
    try {
      const { data, error } = await supabase.auth.getSession();
      const snap: Snapshot = {
        session: (data?.session as RawSession) ?? null,
        error: (error as Error | null) ?? null,
        fetchedAt: Date.now(),
      };
      _cached = snap;
      return snap;
    } catch (e) {
      const snap: Snapshot = {
        session: null,
        error: e instanceof Error ? e : new Error(String(e)),
        fetchedAt: Date.now(),
      };
      _cached = snap;
      return snap;
    } finally {
      _inflight = null;
    }
  })();

  const snap = await _inflight;
  return { data: { session: snap.session }, error: snap.error };
}

/**
 * Returns a stable Supabase session object (or null).
 *
 * Uses the in-memory store when fresh; otherwise falls back to a single-flighted
 * supabase.auth.getSession() call with a 5-second snapshot cache.
 */
export async function getStableSession(): Promise<RawSession> {
  const { data } = await getStableSessionResult();
  return data.session;
}

/**
 * Synchronous guard: returns true if the auth store has any session object.
 *
 * Use this for "is the user still signed in?" checks that do not need a
 * freshness guarantee (e.g. SyncEngine pre-flight guards before query
 * invalidations). Does NOT call Supabase.
 */
export function hasActiveSession(): boolean {
  const s = _storeSession();
  return s != null && Boolean(s.user?.id);
}

/**
 * Call after sign-out or after an explicit auth refresh so the next caller
 * gets a fresh read from Supabase rather than a stale snapshot.
 */
export function invalidateSessionSnapshot(): void {
  _cached = null;
}
