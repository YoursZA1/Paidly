import { getPublicApiBase } from "@/api/backendClient";

async function parseJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export async function fetchPublicLeaveApproval(token) {
  const apiBase = getPublicApiBase();
  const url = `${apiBase}/api/public-leave?token=${encodeURIComponent(String(token || "").trim())}`;
  // eslint-disable-next-line no-restricted-syntax -- public token endpoint
  const res = await fetch(url);
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data?.error || "Could not load leave request.");
  return data;
}

export async function decidePublicLeave({ token, action, reason, comment }) {
  const apiBase = getPublicApiBase();
  // eslint-disable-next-line no-restricted-syntax -- public token endpoint
  const res = await fetch(`${apiBase}/api/public-leave/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: String(token || "").trim(),
      action,
      reason,
      comment,
    }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data?.error || "Could not update leave request.");
  return data;
}
