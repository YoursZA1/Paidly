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

export async function fetchPublicQuotePayload(shareToken) {
  const apiBase = getPublicApiBase();
  const url = `${apiBase}/api/public-quote?token=${encodeURIComponent(String(shareToken || "").trim())}`;
  // eslint-disable-next-line no-restricted-syntax -- public share endpoint intentionally does not use session auth wrappers
  const res = await fetch(url);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Empty or invalid API error response");
  }
  if (!data || typeof data !== "object" || !data.quote) {
    throw new Error("Malformed public quote response");
  }
  return data;
}
