import { backendApi } from "./backendClient";

/**
 * Permanently delete the signed-in user's auth account and linked data (requires Node API).
 * Server purges storage, then deletes auth user; DB trigger removes subscriptions / affiliate apps / waitlist PII;
 * owned organizations cascade with invoices, clients, etc.
 *
 * @param {string} accessToken - JWT from supabase.auth.getSession()
 * @returns {Promise<void>}
 */
export async function deleteMyAccount(accessToken) {
  const t = String(accessToken || "").trim();
  if (!t) {
    throw new Error("Not signed in");
  }
  const { status, data } = await backendApi.post(
    "/api/account/delete",
    { confirmPhrase: "DELETE" },
    {
      headers: { Authorization: `Bearer ${t}` },
      validateStatus: () => true,
    }
  );
  if (status !== 200) {
    throw new Error(data?.error || "Could not delete account");
  }
}
