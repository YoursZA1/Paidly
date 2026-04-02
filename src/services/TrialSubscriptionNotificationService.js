/**
 * In-app notifications (Supabase `notifications`) for the 7-day signup trial.
 * Skips users with profile status `active` (typically admin-enabled billing) or `suspended`.
 * Dedupes by a stable prefix in the message so we do not spam on every page load.
 */

import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@/api/entities';
import { createActivityNotification } from '@/services/ActivityNotificationService';

function tierLabel(plan) {
  const x = String(plan || 'individual').toLowerCase();
  if (['sme', 'professional', 'business'].includes(x)) return 'SME';
  if (['corporate', 'enterprise'].includes(x)) return 'Corporate';
  return 'Individual';
}

function dedupePrefix(phase, userId, trialEndDay) {
  return `paidly-trial-${phase}-${trialEndDay}-${userId}|`;
}

async function alreadySent(userId, phase, trialEndDay) {
  const p = dedupePrefix(phase, userId, trialEndDay);
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .ilike('message', `${p}%`)
      .limit(1);
    if (error) return false;
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Call when the app shell loads (throttle in caller). Uses User.me() for trial + plan fields.
 */
export async function checkTrialSubscriptionNotifications() {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user?.id) return;

  let profile;
  try {
    profile = await User.me();
  } catch {
    return;
  }

  const status = String(profile?.status || '').toLowerCase();
  if (status === 'active' || status === 'suspended') return;

  const trialEndsAt = profile?.trial_ends_at;
  if (!trialEndsAt) return;

  const trialEnd = new Date(trialEndsAt);
  if (Number.isNaN(trialEnd.getTime())) return;

  const trialEndDay = String(trialEndsAt).slice(0, 10);
  const now = new Date();
  const calendarDaysLeft = differenceInCalendarDays(startOfDay(trialEnd), startOfDay(now));

  const planName = tierLabel(profile?.subscription_plan || profile?.plan);
  const userId = user.id;

  const dateLong = trialEnd.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  if (now < trialEnd) {
    if (calendarDaysLeft <= 1) {
      if (!(await alreadySent(userId, 'lastday', trialEndDay))) {
        const when =
          calendarDaysLeft === 0
            ? `today (${dateLong})`
            : `tomorrow (${dateLong})`;
        await createActivityNotification(
          userId,
          `${dedupePrefix('lastday', userId, trialEndDay)}Your free trial ends ${when}. You chose the ${planName} plan — subscribe in Settings → Subscription to keep full access.`
        );
      }
      return;
    }
    if (calendarDaysLeft >= 2 && calendarDaysLeft <= 3) {
      if (!(await alreadySent(userId, 'soon', trialEndDay))) {
        await createActivityNotification(
          userId,
          `${dedupePrefix('soon', userId, trialEndDay)}Your free trial ends on ${dateLong} (${planName} plan). Subscribe in Settings → Subscription before it ends to continue without interruption.`
        );
      }
    }
    return;
  }

  if (!(await alreadySent(userId, 'ended', trialEndDay))) {
    await createActivityNotification(
      userId,
      `${dedupePrefix('ended', userId, trialEndDay)}Your free trial has ended (${planName} plan). Add a subscription in Settings → Subscription to keep using Paidly.`
    );
  }
}

export default { checkTrialSubscriptionNotifications };
