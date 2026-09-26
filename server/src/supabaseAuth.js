import { supabaseAdmin } from "./supabaseAdmin.js";
import { EMAIL_NOT_VERIFIED, isEmailVerifiedUser } from "../../shared/auth/emailVerification.js";

/**
 * Resolve the caller from `Authorization: Bearer <jwt>`.
 * On the **Node API** this uses `supabaseAdmin.auth.getUser(token)` — not `supabase.auth.getUser()`
 * without a token (that’s a client pattern). Always run this (or `requireAuthMiddleware`) before
 * any privileged DB or admin action.
 */
export const getUserFromRequest = async (req) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { user: null, error: "Missing bearer token" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) {
    return { user: null, error: error.message };
  }

  // Validate that data exists and contains a user object
  if (!data || !data.user) {
    return { user: null, error: "Invalid authentication response: user data missing" };
  }

  // Email verification is required before normal Paidly access — also enforced here so an unverified
  // session (e.g. if "Confirm email" were ever switched off in Supabase) cannot use the API.
  if (!isEmailVerifiedUser(data.user)) {
    return { user: null, error: "Email not verified", code: EMAIL_NOT_VERIFIED };
  }

  return { user: data.user, error: null };
};

/**
 * Express middleware: require a valid Bearer session before the route handler runs.
 * Sets `req.authUser` to the Supabase user object.
 */
export async function requireAuthMiddleware(req, res, next) {
  const { user } = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.authUser = user;
  next();
}
