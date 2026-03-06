/**
 * Business goals API (Supabase). RLS: users read own row; only workspace owner can upsert.
 */
import { supabase } from '@/lib/supabaseClient';

const TABLE = 'business_goals';

/**
 * @param {string} userId - auth user id
 * @param {number} year - e.g. 2026
 * @returns {Promise<{ annual_target: number, strategy_type: string } | null>}
 */
export async function getBusinessGoal(userId, year) {
  if (!userId || !year) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, annual_target, strategy_type')
    .eq('user_id', userId)
    .eq('year', Number(year))
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Upsert goal for the given user and year. RLS allows only workspace owner.
 * @param {string} userId - auth user id
 * @param {number} year - e.g. 2026
 * @param {{ annual_target: number, strategy_type: string }} payload
 */
export async function upsertBusinessGoal(userId, year, payload) {
  if (!userId || !year) throw new Error('userId and year are required');
  const row = {
    user_id: userId,
    year: Number(year),
    annual_target: Number(payload.annual_target) || 0,
    strategy_type: payload.strategy_type === 'aggressive' ? 'aggressive' : 'steady',
  };
  const { error } = await supabase.from(TABLE).upsert(row, {
    onConflict: 'user_id,year',
  });
  if (error) throw error;
}
