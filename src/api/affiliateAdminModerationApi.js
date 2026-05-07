/**
 * Production affiliate admin mutations: approve / decline / resend referral email.
 *
 * - Canonical routes: POST `/api/admin/approve`, POST `/api/admin/decline`
 * - Auth: `Authorization: Bearer <Supabase access_token>` (session refresh attempted if needed)
 * - Body: `{ applicationId, commissionRate? }` for approve; `{ applicationId }` for decline
 */
import { resolveAffiliateAdminMutationUrl } from '@/api/fetchAdminAffiliateApplications';
import { apiErrorFieldToString, formatHttpStatusMessage } from '@/utils/apiErrorText';
import { apiRequest } from '@/utils/apiRequest';
import { getSessionAccessTokenOrHandleUnauthorized } from '@/lib/rpcSessionPolicy';

export const AFFILIATE_ADMIN = {
  APPROVE: '/api/admin/approve',
  UPDATE_COMMISSION: '/api/admin/affiliate-commission',
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
  const token = await getSessionAccessTokenOrHandleUnauthorized('affiliate-admin-missing-token');
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
    throw new Error(
      msg.trim()
        ? msg
        : formatHttpStatusMessage(res.status, {
            forbidden:
              'Admin access required — your account needs admin, management, or support role for this action.',
            fallback: `Request failed (${res.status})`,
          })
    );
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
 * @param {{ applicationId: string, commissionRate: number }} params
 */
export async function updateAffiliateCommissionRate({ applicationId, commissionRate }) {
  if (!applicationId) throw new Error('applicationId is required');
  const parsed = Number(commissionRate);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error('commissionRate must be a number between 0 and 100');
  }
  return postAffiliateAdminAuthed(AFFILIATE_ADMIN.UPDATE_COMMISSION, {
    applicationId,
    commissionRate: parsed,
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
