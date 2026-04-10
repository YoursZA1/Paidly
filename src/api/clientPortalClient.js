/**
 * Client portal HTTP client — talks to `/api/client-portal/*` (Express locally, Vercel in prod).
 * All document data is loaded from Supabase via the server; this module is transport only.
 */

const BASE = "/api/client-portal";

async function parseJsonResponse(res) {
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  return data;
}

export async function portalLogin(email) {
  const r = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: String(email || "").trim().toLowerCase() }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Login failed (${r.status})`);
  }
  return data;
}

export async function portalFetchData(token) {
  const r = await fetch(`${BASE}/data`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Could not load portal data (${r.status})`);
  }
  return data;
}

export async function portalUpdateClient(token, patch) {
  const r = await fetch(`${BASE}/client`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch || {}),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Update failed (${r.status})`);
  }
  return data;
}

export async function portalProcessPayment(token, payload) {
  const r = await fetch(`${BASE}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Payment failed (${r.status})`);
  }
  return data;
}

export async function portalGetMessages(token) {
  const r = await fetch(`${BASE}/messages`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Messages failed (${r.status})`);
  }
  return data?.messages ?? [];
}

export async function portalSendMessage(token, { content, attachments }) {
  const r = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, attachments }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    throw new Error(data?.error || `Send failed (${r.status})`);
  }
  return data;
}
