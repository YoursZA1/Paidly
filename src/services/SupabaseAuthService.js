import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const mapAuthError = (error) => getSupabaseErrorMessage(error, "Authentication error");

const normalizeSession = (session) => {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: session.user
  };
};

const SupabaseAuthService = {
  async signUpWithEmail(email, password, profile = {}) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: profile
      }
    });

    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data.session);
  },

  async signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data.session);
  },

  async signInWithMagicLink(email, redirectTo = null) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo || window.location.origin
      }
    });

    if (error) throw new Error(mapAuthError(error));
    return true;
  },

  async signInWithOAuth(provider, redirectTo = null) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || window.location.origin
      }
    });

    if (error) throw new Error(mapAuthError(error));
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(mapAuthError(error));
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data.session);
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(mapAuthError(error));
    return data?.user ?? null;
  },
};

export default SupabaseAuthService;
