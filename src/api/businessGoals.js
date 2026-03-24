/**
 * Business goals API (Supabase). RLS: users read/write own rows (see scripts/fix-business-goals-rls-self-service.sql).
 */
import { supabase } from '@/lib/supabaseClient';

const TABLE = 'business_goals';

/**
 * `business_goals.user_id` must match `auth.uid()` — prefer Supabase auth id from profile objects.
 * @param {object|null|undefined} user
 * @returns {string|null}
 */
export function resolveBusinessGoalsUserId(user) {
  if (!user || typeof user !== 'object') return null;
  const raw = user.supabase_id ?? user.auth_id ?? user.id;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/**
 * @param {string} userId - auth user id
 * @param {number} year - e.g. 2026
 * @returns {Promise<{ id: string, year: number, annual_target: number, strategy_type: string } | null>}
 */
export async function getBusinessGoal(userId, year) {
  if (!userId || !year) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, year, annual_target, strategy_type")
    .eq("user_id", userId)
    .eq("year", Number(year))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const rowYear = Number(data.year);
  if (Number(year) !== rowYear) return null;
  return data;
}

function isUniqueViolation(err) {
  const code = err?.code;
  const msg = String(err?.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

/**
 * Insert or update goal for the given user and year (avoids PostgREST upsert + RLS edge cases).
 * @param {string} userId - auth user id
 * @param {number} year - e.g. 2026
 * @param {{ annual_target: number, strategy_type: string }} payload
 */
export async function upsertBusinessGoal(userId, year, payload) {
  if (!userId || !year) throw new Error('userId and year are required');
  const y = Number(year);
  const body = {
    annual_target: Number(payload.annual_target) || 0,
    strategy_type: payload.strategy_type === 'aggressive' ? 'aggressive' : 'steady',
  };

  const existing = await getBusinessGoal(userId, y);
  if (existing?.id) {
    const { error } = await supabase.from(TABLE).update(body).eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    year: y,
    ...body,
  });
  if (error) {
    if (isUniqueViolation(error)) {
      const again = await getBusinessGoal(userId, y);
      if (again?.id) {
        const { error: e2 } = await supabase.from(TABLE).update(body).eq('id', again.id);
        if (!e2) return;
        throw e2;
      }
    }
    throw error;
  }
}
