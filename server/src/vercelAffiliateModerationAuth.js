/**
 * Bearer JWT + affiliate moderation role check for Vercel serverless handlers.
 * Matches Express semantics: 401 missing/invalid token, 403 wrong role.
 */

import { canMutateAffiliateApplication } from "./adminRouteAccess.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @returns {Promise<import("@supabase/auth-js").User | null>}
 */
export async function assertVercelAffiliateModerationAuth(supabase, req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }

  if (!(await canMutateAffiliateApplication(supabase, authData.user))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return authData.user;
}
