/**
 * Production affiliate admin mutations: approve / decline / resend referral email.
 *
 * - Canonical routes: POST `/api/admin/approve`, POST `/api/admin/decline`
 * - Auth: `Authorization: Bearer <Supabase access_token>` (session refresh attempted if needed)
 * - Body: `{ applicationId, commissionRate? }` for approve; `{ applicationId }` for decline
 */
import { supabase } from '@/lib/supabaseClient';
import { resolveAffiliateAdminMutationUrl } from '@/api/fetchAdminAffiliateApplications';
import { apiErrorFieldToString } from '@/utils/apiErrorText';
import { apiRequest } from '@/utils/apiRequest';

export const AFFILIATE_ADMIN = {
  APPROVE: '/api/admin/approve',
  DECLINE: '/api/admin/decline',
  RESEND_LINK: '/api/affiliates/resend-link',
};
const AFFILIATE_ADMIN_MUTATION_METHOD = 'POST';

/**
 * @param {string} path Absolute or root-relative API path
 * @param {Record<string, unknown>} body
 * @returns {Promise<Record<string, unknown>>}
 */
export async function postAffiliateAdminAuthed(path, body = {}) {
  let { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData?.session;
  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed?.session ?? null;
  }
  const token = session?.access_token;
  if (!token) {
    throw new Error('Not authenticated — sign in again (no access token for API).');
  }

  const url = resolveAffiliateAdminMutationUrl(path);
  const payload =
    body &&
    typeof body === 'object' &&
    body.applicationId != null &&
    body.id == null &&
    !Array.isArray(body)
      ? { ...body, id: body.applicationId }
      : body;

  const res = await apiRequest(url, {
    method: AFFILIATE_ADMIN_MUTATION_METHOD,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      apiErrorFieldToString(json?.message) ||
      apiErrorFieldToString(json?.error) ||
      `Request failed (${res.status})`;
    if (res.status === 401) {
      throw new Error(msg.trim() ? msg : 'Session expired or invalid — please sign in again.');
    }
    if (res.status === 403) {
      throw new Error(
        msg.trim()
          ? msg
          : 'Admin access required — your account needs admin, management, or support role for this action.'
      );
    }
    throw new Error(msg.trim() ? msg : `Request failed (${res.status})`);
  }
  return json;
}

/**
 * @param {{ applicationId: string, commissionRate?: number }} params
 * @returns {Promise<{ ok?: boolean, referral_code?: string, referral_link?: string, user_id?: string, email_sent?: boolean, email_error?: string }>}
 */
export async function approveAffiliateApplication({ applicationId, commissionRate }) {
  if (!applicationId) throw new Error('applicationId is required');
  return postAffiliateAdminAuthed(AFFILIATE_ADMIN.APPROVE, {
    applicationId,
    ...(commissionRate != null ? { commissionRate: Number(commissionRate) } : {}),
  });
}

/**
 * @param {{ applicationId: string }} params
 */
export async function declineAffiliateApplication({ applicationId }) {
  if (!applicationId) throw new Error('applicationId is required');
  return postAffiliateAdminAuthed(AFFILIATE_ADMIN.DECLINE, { applicationId });
}

/**
 * @param {{ applicationId: string }} params
 */
export async function resendAffiliateReferralEmail({ applicationId }) {
  if (!applicationId) throw new Error('applicationId is required');
  return postAffiliateAdminAuthed(AFFILIATE_ADMIN.RESEND_LINK, { applicationId });
}
