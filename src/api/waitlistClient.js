import { backendApi } from "@/api/backendClient";

/**
 * @param {{ email: string, name?: string, source?: string }} payload
 * @returns {Promise<{ ok: boolean, message?: string, error?: string }>}
 */
export async function submitWaitlistSignup(payload) {
  const { data } = await backendApi.post("/api/waitlist", {
    email: payload.email,
    name: payload.name,
    source: payload.source || "landing",
  });
  return data;
}
