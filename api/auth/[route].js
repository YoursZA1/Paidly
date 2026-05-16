/**
 * Auth routes in one function (Vercel Hobby ≤12 functions).
 * Handles /api/auth/sign-in, sign-up, refresh, forgot-password, bootstrap-user.
 * /api/bootstrap-org → vercel.json rewrite → /api/auth/bootstrap-user
 */
import authSignInHandler from "../../server/src/auth/authSignInApi.js";
import authSignUpHandler from "../../server/src/auth/authSignUpApi.js";
import authRefreshHandler from "../../server/src/auth/authRefreshApi.js";
import authForgotPasswordHandler from "../../server/src/auth/authForgotPasswordApi.js";
import bootstrapUserOrganizationHandler from "../../server/src/bootstrapUserOrganizationApi.js";

const ROUTES = {
  "sign-in": authSignInHandler,
  "sign-up": authSignUpHandler,
  refresh: authRefreshHandler,
  "forgot-password": authForgotPasswordHandler,
  "bootstrap-user": bootstrapUserOrganizationHandler,
};

export default async function handler(req, res) {
  const route = String(req.query.route || "").trim();
  const fn = ROUTES[route];
  if (!fn) {
    return res.status(404).json({ error: "Not found" });
  }
  return fn(req, res);
}
