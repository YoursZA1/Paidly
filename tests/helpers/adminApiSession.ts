import { createClient } from '@supabase/supabase-js';

/**
 * Browser JWT for the Node API (same as the app uses after login).
 */
export async function getAccessTokenForUser(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error('signInWithPassword: no access_token');
  return token;
}
