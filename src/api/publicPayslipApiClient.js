import { getPublicApiBase } from "@/api/backendClient";

async function parseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

/**
 * @param {string} shareToken - payslips.public_share_token (UUID)
 * @param {string|null} viewerToken
 */
export async function fetchPublicPayslipPayload(shareToken, viewerToken = null) {
  const apiBase = getPublicApiBase();
  const url = `${apiBase}/api/public-payslip?token=${encodeURIComponent(shareToken)}`;
  const headers = {};
  if (viewerToken) {
    headers.Authorization = `Bearer ${viewerToken}`;
  }
  const res = await fetch(url, { headers });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function verifyPublicPayslipEmail(shareToken, email) {
  const apiBase = getPublicApiBase();
  const res = await fetch(`${apiBase}/api/public-payslip-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: String(shareToken).trim(),
      email: String(email || "").trim().toLowerCase(),
    }),
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Verification failed (${res.status})`);
  }
  if (!data.viewerToken) {
    throw new Error("Invalid response from server");
  }
  return data.viewerToken;
}
