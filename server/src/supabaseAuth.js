import { supabaseAdmin } from "./supabaseAdmin.js";

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

  return { user: data.user, error: null };
};
