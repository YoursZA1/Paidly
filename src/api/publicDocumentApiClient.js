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

export async function fetchPublicDocumentPayload(shareToken) {
  const apiBase = getPublicApiBase();
  const url = `${apiBase}/api/public-document?token=${encodeURIComponent(String(shareToken || "").trim())}`;
  // eslint-disable-next-line no-restricted-syntax -- public share endpoint intentionally does not use session auth wrappers
  const res = await fetch(url);
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Could not open this document");
  }
  if (!data || typeof data !== "object" || !data.document) {
    throw new Error("Malformed public document response");
  }
  return data;
}
