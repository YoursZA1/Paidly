import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";

const STATE_TTL_MS = 10 * 60 * 1000;

export function generateOAuthStateToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * @param {{ orgId: string, userId: string, provider: 'square'|'yoco' }} input
 */
export async function createPosOAuthState({ orgId, userId, provider }) {
  const stateToken = generateOAuthStateToken();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from("pos_oauth_states").insert({
    org_id: orgId,
    user_id: userId,
    provider,
    state_token: stateToken,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message || "Could not create OAuth state");
  return { stateToken, expiresAt };
}

/**
 * @param {string} stateToken
 * @param {string} provider
 */
export async function consumePosOAuthState(stateToken, provider) {
  const token = String(stateToken || "").trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from("pos_oauth_states")
    .select("id, org_id, user_id, provider, expires_at")
    .eq("state_token", token)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message || "OAuth state lookup failed");
  if (!data) return null;

  await supabaseAdmin.from("pos_oauth_states").delete().eq("id", data.id);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}
