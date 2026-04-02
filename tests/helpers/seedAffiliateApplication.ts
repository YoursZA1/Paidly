import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function adminClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function insertPendingAffiliateApplication(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string
): Promise<string> {
  const supabase = adminClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('affiliate_applications')
    .insert({
      email: email.toLowerCase(),
      full_name: 'E2E Affiliate Applicant',
      why_promote: 'Playwright seed row',
      audience_platform: 'other',
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('insertPendingAffiliateApplication: no id returned');
  return data.id as string;
}

export async function deleteAffiliateApplication(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
): Promise<void> {
  const supabase = adminClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.from('affiliate_applications').delete().eq('id', id);
  if (error) throw error;
}

export async function getAffiliateApplicationStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  id: string
): Promise<string | null> {
  const supabase = adminClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase.from('affiliate_applications').select('status').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.status != null ? String(data.status) : null;
}
