import { supabase } from "@/lib/supabaseClient";
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { apiErrorFieldToString } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";

/** Must match server/src/adminPlatformUserMessages.js */
const ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT = 300;
const ADMIN_PLATFORM_MESSAGE_MAX_CONTENT = 50_000;
const ADMIN_MESSAGE_REQUEST_TIMEOUT_MS = 45_000;

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function buildPlatformUserMessagesGetUrls(recipientId, threadLimit, listLimit, messageType, listCursor, threadCursor) {
  const params = new URLSearchParams();
  if (recipientId) params.set("recipient_id", recipientId);
  if (threadLimit != null) params.set("thread_limit", String(threadLimit));
  if (listLimit != null) params.set("list_limit", String(listLimit));
  if (messageType) params.set("message_type", String(messageType));
  if (listCursor) params.set("list_cursor", String(listCursor));
  if (threadCursor) params.set("thread_cursor", String(threadCursor));
  const q = params.toString() ? `?${params.toString()}` : "";

  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");

  push(`/api/admin/platform-user-messages${q}`);
  if (vite) push(`${vite}/api/admin/platform-user-messages${q}`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/platform-user-messages${q}`);

  return out;
}

function buildSendPlatformMessagePostUrls() {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };
  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");
  push("/api/admin/send-platform-message");
  if (vite) push(`${vite}/api/admin/send-platform-message`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/send-platform-message`);
  return out;
}

function buildSendMessagePostUrls() {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };
  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");
  push("/api/admin/send-message");
  if (vite) push(`${vite}/api/admin/send-message`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/send-message`);
  return out;
}

function buildBroadcastUpdatePostUrls() {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };
  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");
  push("/api/admin/broadcast-update");
  if (vite) push(`${vite}/api/admin/broadcast-update`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/broadcast-update`);
  return out;
}

function buildBroadcastJobsGetUrls(limit = 100, cursor) {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (cursor) params.set("cursor", String(cursor));
  const q = params.toString() ? `?${params.toString()}` : "";
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };
  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");
  push(`/api/admin/broadcast-jobs${q}`);
  if (vite) push(`${vite}/api/admin/broadcast-jobs${q}`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/broadcast-jobs${q}`);
  return out;
}

async function apiRequestWithTimeout(url, init, timeoutMs = ADMIN_MESSAGE_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await apiRequest(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getSessionToken() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(getSupabaseErrorMessage(sessionError, "Session error"));
  }
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error("Not authenticated");
  }
  return token;
}

/**
 * @param {{ recipientId?: string, threadLimit?: number, listLimit?: number, messageType?: "direct" | "broadcast", listCursor?: string, threadCursor?: string }} opts
 * @returns {Promise<{ conversations?: Array<{ recipient_id: string, last_at: string, preview: string, subject: string }>, messages?: Array<Record<string, unknown>> }>}
 */
export async function fetchAdminPlatformUserMessages(opts = {}) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin platform messages API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }

  const token = await getSessionToken();
  const recipientId = opts.recipientId ? String(opts.recipientId).trim() : "";
  const candidates = buildPlatformUserMessagesGetUrls(
    recipientId || undefined,
    opts.threadLimit,
    opts.listLimit,
    opts.messageType,
    opts.listCursor,
    opts.threadCursor
  );

  let lastError = null;
  for (const url of candidates) {
    let res;
    try {
      res = await apiRequest(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        credentials: "include",
      });
    } catch (e) {
      lastError = e?.message || "Network error (Failed to fetch)";
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const text = looksJson ? null : await res.text().catch(() => "");
    const payload = looksJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      let fromJson = "";
      if (looksJson) {
        const raw = payload.error ?? payload.message;
        if (raw != null && raw !== "") {
          fromJson = apiErrorFieldToString(raw);
        }
      }
      lastError =
        fromJson ||
        (res.status === 401
          ? "Session expired or invalid. Please log in again."
          : res.status === 403
            ? "Admin access required."
            : `HTTP ${res.status}`);
      continue;
    }

    if (!looksJson) {
      const preview = String(text || "").slice(0, 80).replace(/\s+/g, " ");
      lastError =
        preview.startsWith("<!") || preview.startsWith("<html")
          ? "Admin API returned HTML — set VITE_SERVER_URL to your API host."
          : "Admin API returned non-JSON.";
      continue;
    }

    if (recipientId) {
      if (!Array.isArray(payload.messages)) {
        lastError = "Invalid response (expected { messages: array }).";
        continue;
      }
    } else if (!Array.isArray(payload.conversations)) {
      lastError = "Invalid response (expected { conversations: array }).";
      continue;
    }

    return payload;
  }

  throw new Error(lastError || "Admin platform messages API failed");
}

/**
 * @param {{ recipientId: string, subject?: string, content: string }} body
 * @returns {Promise<{ message: Record<string, unknown>, emailDelivery: { status: string, reason?: string } }>}
 */
export async function postAdminPlatformUserMessage(body) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin send message API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }

  const token = await getSessionToken();
  const candidates = buildSendPlatformMessagePostUrls();
  const subject = body.subject != null ? String(body.subject) : "";
  const content = String(body.content || "").trim();
  if (subject.length > ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) {
    throw new Error(`Subject is too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT} characters).`);
  }
  if (content.length > ADMIN_PLATFORM_MESSAGE_MAX_CONTENT) {
    throw new Error(`Message is too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_CONTENT} characters).`);
  }

  const json = {
    recipient_id: String(body.recipientId || "").trim(),
    subject,
    content,
  };

  let lastError = null;
  for (const url of candidates) {
    let res;
    try {
      res = await apiRequestWithTimeout(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(json),
      });
    } catch (e) {
      if (String(e?.name || "") === "AbortError") {
        lastError = "Send request timed out. Please try again.";
      } else {
        lastError = e?.message || "Network error (Failed to fetch)";
      }
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const payload = looksJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      const raw = payload.error ?? payload.message;
      const fromJson = raw != null && raw !== "" ? apiErrorFieldToString(raw) : "";
      lastError =
        fromJson ||
        (res.status === 401
          ? "Session expired or invalid. Please log in again."
          : res.status === 403
            ? "Admin access required."
            : res.status === 503
              ? "Database is missing the admin messages table. Apply migration 20260411180000_admin_platform_messages.sql (e.g. supabase db push), then retry."
              : `HTTP ${res.status}`);
      continue;
    }

    if (!payload.ok || !payload.message) {
      lastError = "Invalid send response.";
      continue;
    }

    const emailDelivery = payload.email_delivery;
    const normalizedDelivery =
      emailDelivery && typeof emailDelivery === "object" && typeof emailDelivery.status === "string"
        ? emailDelivery
        : { status: "skipped", reason: "email_delivery_missing" };

    return { message: payload.message, emailDelivery: normalizedDelivery };
  }

  throw new Error(lastError || "Send platform message failed");
}

/**
 * @param {{ recipientIds?: string[], recipientId?: string, subject?: string, content: string, sendEmail?: boolean, sendInApp?: boolean }} body
 */
export async function postAdminSendMessage(body) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin send message API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }

  const token = await getSessionToken();
  const candidates = buildSendMessagePostUrls();
  const subject = body.subject != null ? String(body.subject) : "";
  const content = String(body.content || "").trim();
  if (subject.length > ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) {
    throw new Error(`Subject is too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT} characters).`);
  }
  if (content.length > ADMIN_PLATFORM_MESSAGE_MAX_CONTENT) {
    throw new Error(`Message is too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_CONTENT} characters).`);
  }

  const json = {
    recipient_id: body.recipientId ? String(body.recipientId).trim() : "",
    recipient_ids: Array.isArray(body.recipientIds) ? body.recipientIds : undefined,
    subject,
    content,
    send_email: body.sendEmail != null ? Boolean(body.sendEmail) : true,
    send_in_app: body.sendInApp != null ? Boolean(body.sendInApp) : true,
  };

  let lastError = null;
  for (const url of candidates) {
    let res;
    try {
      res = await apiRequestWithTimeout(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(json),
      });
    } catch (e) {
      lastError = String(e?.name || "") === "AbortError" ? "Send request timed out. Please try again." : e?.message || "Network error (Failed to fetch)";
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const payload = looksJson ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      const raw = payload.error ?? payload.message;
      const fromJson = raw != null && raw !== "" ? apiErrorFieldToString(raw) : "";
      lastError = fromJson || `HTTP ${res.status}`;
      continue;
    }
    if (!payload?.ok) {
      lastError = "Invalid send response.";
      continue;
    }
    return payload;
  }

  throw new Error(lastError || "Send message failed");
}

/**
 * @param {{ subject?: string, content: string }} body
 * @returns {Promise<{ jobId: string | null, status: string, recipients: number, inserted: number, insertedMessages: number, emailSent: number, emailSkipped: number, emailFailed: number, emailQueued: number }>}
 */
export async function postAdminBroadcastUpdate(body) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin broadcast API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }

  const token = await getSessionToken();
  const candidates = buildBroadcastUpdatePostUrls();
  const subject = body.subject != null ? String(body.subject) : "";
  const content = String(body.content || "").trim();
  const idempotencyKey = makeIdempotencyKey();

  let lastError = null;
  for (const url of candidates) {
    let res;
    try {
      res = await apiRequestWithTimeout(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
        body: JSON.stringify({ subject, content, idempotency_key: idempotencyKey }),
      });
    } catch (e) {
      if (String(e?.name || "") === "AbortError") {
        lastError = "Broadcast request timed out. Please retry with a shorter message.";
      } else {
        lastError = e?.message || "Network error (Failed to fetch)";
      }
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const payload = looksJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      const raw = payload.error ?? payload.message;
      const fromJson = raw != null && raw !== "" ? apiErrorFieldToString(raw) : "";
      lastError =
        fromJson ||
        (res.status === 401
          ? "Session expired or invalid. Please log in again."
          : res.status === 403
            ? "Admin access required."
            : `HTTP ${res.status}`);
      continue;
    }

    if (!payload.ok) {
      lastError = "Invalid broadcast response.";
      continue;
    }

    return {
      jobId: payload.jobId ? String(payload.jobId) : null,
      status: String(payload.status || "queued"),
      recipients: Number(payload.recipients || 0),
      inserted: Number(payload.inserted || 0),
      insertedMessages: Number(payload.insertedMessages || 0),
      emailSent: Number(payload.emailSent || 0),
      emailSkipped: Number(payload.emailSkipped || 0),
      emailFailed: Number(payload.emailFailed || 0),
      emailQueued: Number(payload.emailQueued || 0),
    };
  }

  throw new Error(lastError || "Broadcast update failed");
}

/**
 * @param {{ limit?: number, cursor?: string }} opts
 * @returns {Promise<{ jobs: Array<Record<string, unknown>>, next_cursor?: string | null }>}
 */
export async function fetchAdminBroadcastJobs(opts = {}) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin broadcast jobs API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }
  const token = await getSessionToken();
  const candidates = buildBroadcastJobsGetUrls(opts.limit ?? 100, opts.cursor);
  let lastError = null;
  for (const url of candidates) {
    let res;
    try {
      res = await apiRequest(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        credentials: "include",
      });
    } catch (e) {
      lastError = e?.message || "Network error (Failed to fetch)";
      continue;
    }
    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const payload = looksJson ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      const raw = payload.error ?? payload.message;
      const fromJson = raw != null && raw !== "" ? apiErrorFieldToString(raw) : "";
      lastError = fromJson || `HTTP ${res.status}`;
      continue;
    }
    if (!Array.isArray(payload.jobs)) {
      lastError = "Invalid broadcast jobs response.";
      continue;
    }
    return { jobs: payload.jobs, next_cursor: payload.next_cursor ?? null };
  }
  throw new Error(lastError || "Broadcast jobs fetch failed");
}
