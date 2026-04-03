import { supabase } from '@/lib/supabaseClient';
import { resolveAffiliateAdminMutationUrl } from '@/api/fetchAdminAffiliateApplications';

/**
 * POST to admin affiliate routes (approve, decline, resend-link). Uses session Bearer token.
 * @param {string} path e.g. `/api/admin/approve`
 * @param {Record<string, unknown>} body
 */
export async function callAdminAffiliateMutation(path, body = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const url = resolveAffiliateAdminMutationUrl(path);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
  return json;
}
