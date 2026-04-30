import { supabase } from "@/lib/supabaseClient";

const DRAFT_STORAGE_PREFIX = "paidly_autodraft_v1";

function keyFor(userId, documentType, draftKey) {
  return `${DRAFT_STORAGE_PREFIX}:${String(userId || "anon")}:${String(documentType)}:${String(draftKey)}`;
}

export function getDraftStorageKey(userId, documentType, draftKey) {
  return keyFor(userId, documentType, draftKey);
}

export function readLocalDraft(userId, documentType, draftKey) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId, documentType, draftKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeLocalDraft(userId, documentType, draftKey, draft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId, documentType, draftKey), JSON.stringify(draft));
  } catch {
    // ignore quota/storage failures
  }
}

export function removeLocalDraft(userId, documentType, draftKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(userId, documentType, draftKey));
  } catch {
    // ignore
  }
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
}

async function callDraftApi(path, payload, signal) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload || {}),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `Draft API failed (${res.status})`);
    err.code = json?.code || null;
    throw err;
  }
  return json;
}

export async function fetchRemoteDraft({ userId, documentType, draftKey, signal }) {
  return callDraftApi(
    "/api/drafts/get",
    { user_id: userId, document_type: documentType, draft_key: draftKey },
    signal
  );
}

export async function saveRemoteDraft({ userId, documentType, draftKey, formData, lastKnownUpdatedAt, signal }) {
  return callDraftApi(
    "/api/drafts/save",
    {
      user_id: userId,
      document_type: documentType,
      draft_key: draftKey,
      form_data: formData,
      last_known_updated_at: lastKnownUpdatedAt || null,
      version: Date.now(),
    },
    signal
  );
}

export async function deleteRemoteDraft({ userId, documentType, draftKey, signal }) {
  return callDraftApi(
    "/api/drafts/delete",
    { user_id: userId, document_type: documentType, draft_key: draftKey },
    signal
  );
}
