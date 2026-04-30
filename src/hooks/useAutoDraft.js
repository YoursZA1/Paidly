import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteRemoteDraft,
  fetchRemoteDraft,
  getDraftStorageKey,
  readLocalDraft,
  removeLocalDraft,
  saveRemoteDraft,
  writeLocalDraft,
} from "@/services/DraftService";

const SAVE_DEBOUNCE_MS = Number(import.meta.env.VITE_DRAFT_DEBOUNCE_MS || 1200);
const SAVE_INTERVAL_MS = Number(import.meta.env.VITE_DRAFT_INTERVAL_MS || 12000);
const INTERVAL_SUPPRESS_AFTER_DEBOUNCE_MS = Number(
  import.meta.env.VITE_DRAFT_INTERVAL_SUPPRESS_MS || Math.min(6000, Math.floor(SAVE_INTERVAL_MS / 2))
);

function stableSegmentHash(value) {
  const seen = new WeakSet();
  const serialized = JSON.stringify(value, (_, next) => {
    if (next && typeof next === "object") {
      if (seen.has(next)) return "[Circular]";
      seen.add(next);
      if (Array.isArray(next)) return next;
      const sorted = {};
      Object.keys(next)
        .sort()
        .forEach((key) => {
          sorted[key] = next[key];
        });
      return sorted;
    }
    return next;
  });

  // Tiny non-cryptographic hash for change detection.
  let hash = 0;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = (hash * 31 + serialized.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function diffFormSegments(currentFormData, previousSegments) {
  const source = currentFormData && typeof currentFormData === "object" ? currentFormData : {};
  const keys = Object.keys(source).sort();
  const nextSegments = {};
  const changedKeys = [];

  keys.forEach((key) => {
    const segment = source[key];
    const prev = previousSegments[key];
    if (prev?.ref === segment) {
      nextSegments[key] = prev;
      return;
    }
    const hash = stableSegmentHash(segment);
    nextSegments[key] = { ref: segment, hash };
    if (!prev || prev.hash !== hash) {
      changedKeys.push(key);
    }
  });

  Object.keys(previousSegments).forEach((key) => {
    if (!(key in source)) changedKeys.push(key);
  });

  const digest = keys.map((key) => `${key}:${nextSegments[key]?.hash || ""}`).join("|");
  return { nextSegments, changedKeys, digest };
}

export function useAutoDraft({ enabled, userId, documentType, draftKey, formData, onRestore }) {
  const [status, setStatus] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [restoreNotice, setRestoreNotice] = useState(null);
  const [conflictMessage, setConflictMessage] = useState("");
  const hasPromptedRef = useRef(false);
  const formDataRef = useRef(formData || {});
  const lastDigestRef = useRef("");
  const segmentStateRef = useRef({});
  const lastKnownUpdatedAtRef = useRef(null);
  const activeSaveControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastDebounceSuccessAtRef = useRef(0);

  useEffect(() => {
    formDataRef.current = formData || {};
  }, [formData]);

  const saveNow = useCallback(
    async (reason = "change") => {
      if (!enabled || !userId || !documentType || !draftKey) return;
      const nowMs = Date.now();
      if (
        reason === "interval" &&
        nowMs - lastDebounceSuccessAtRef.current < INTERVAL_SUPPRESS_AFTER_DEBOUNCE_MS
      ) {
        return;
      }
      const currentFormData = formDataRef.current || {};
      const { nextSegments, changedKeys, digest } = diffFormSegments(
        currentFormData,
        segmentStateRef.current
      );
      segmentStateRef.current = nextSegments;
      if (digest === lastDigestRef.current) return;
      lastDigestRef.current = digest;

      const draftPayload = {
        user_id: userId,
        document_type: documentType,
        draft_key: draftKey,
        form_data: currentFormData,
        changed_keys: changedKeys,
        last_updated: new Date().toISOString(),
        pending_sync: false,
      };
      setStatus("saving");

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        writeLocalDraft(userId, documentType, draftKey, { ...draftPayload, pending_sync: true });
        setStatus("offline");
        setLastSavedAt(draftPayload.last_updated);
        return;
      }

      try {
        if (activeSaveControllerRef.current) {
          activeSaveControllerRef.current.abort();
        }
        const controller = new AbortController();
        activeSaveControllerRef.current = controller;
        const res = await saveRemoteDraft({
          userId,
          documentType,
          draftKey,
          formData: currentFormData,
          lastKnownUpdatedAt: lastKnownUpdatedAtRef.current,
          signal: controller.signal,
        });
        if (res?.updated_at) {
          lastKnownUpdatedAtRef.current = res.updated_at;
        }
        writeLocalDraft(userId, documentType, draftKey, { ...draftPayload, pending_sync: false });
        setStatus("saved");
        setConflictMessage("");
        setLastSavedAt(new Date().toISOString());
        if (reason === "change") {
          lastDebounceSuccessAtRef.current = Date.now();
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (e?.code === "STALE_DRAFT_WRITE") {
          try {
            const latest = await fetchRemoteDraft({ userId, documentType, draftKey });
            if (latest?.draft?.form_data) {
              lastKnownUpdatedAtRef.current = latest.draft.updated_at || null;
              onRestore?.(latest.draft.form_data);
              setStatus("conflict");
              setConflictMessage("Conflict detected. Newer draft restored.");
              setRestoreNotice({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                title: "Newer draft restored",
                description: "A newer draft from another tab/session replaced your local changes to prevent overwrite.",
                at: latest.draft.updated_at || new Date().toISOString(),
              });
              setLastSavedAt(latest.draft.updated_at || new Date().toISOString());
              return;
            }
          } catch {
            // fall through to local backup mode
          }
        }
        writeLocalDraft(userId, documentType, draftKey, { ...draftPayload, pending_sync: true });
        setStatus("offline");
        setLastSavedAt(new Date().toISOString());
      }
    },
    [enabled, userId, documentType, draftKey, onRestore]
  );

  const clearDraft = useCallback(async () => {
    if (!userId || !documentType || !draftKey) return;
    removeLocalDraft(userId, documentType, draftKey);
    try {
      await deleteRemoteDraft({ userId, documentType, draftKey });
    } catch {
      // best effort
    }
    setStatus("idle");
    lastDigestRef.current = "";
    segmentStateRef.current = {};
    lastDebounceSuccessAtRef.current = 0;
    setConflictMessage("");
    setRestoreNotice(null);
  }, [userId, documentType, draftKey]);

  useEffect(() => {
    lastDigestRef.current = "";
    segmentStateRef.current = {};
    lastDebounceSuccessAtRef.current = 0;
    setConflictMessage("");
    setRestoreNotice(null);
  }, [userId, documentType, draftKey]);

  useEffect(() => {
    if (!enabled || !userId || !documentType || !draftKey || hasPromptedRef.current) return;
    hasPromptedRef.current = true;
    let cancelled = false;
    (async () => {
      const local = readLocalDraft(userId, documentType, draftKey);
      let remote = null;
      try {
        remote = await fetchRemoteDraft({ userId, documentType, draftKey });
      } catch {
        remote = null;
      }
      if (cancelled) return;
      const localTs = local?.last_updated ? Date.parse(local.last_updated) : 0;
      const remoteTs = remote?.draft?.last_updated ? Date.parse(remote.draft.last_updated) : 0;
      const chosen = remoteTs > localTs ? remote?.draft : local;
      if (!chosen?.form_data) return;
      const proceed = window.confirm("You have an unsaved draft. Continue editing?");
      if (!proceed) {
        await clearDraft();
        return;
      }
      lastKnownUpdatedAtRef.current = chosen.last_updated || null;
      onRestore?.(chosen.form_data);
      setStatus("saved");
      setLastSavedAt(chosen.last_updated || new Date().toISOString());
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, documentType, draftKey, onRestore, clearDraft]);

  useEffect(() => {
    if (!enabled || !userId || !documentType || !draftKey) return undefined;
    const storageKey = getDraftStorageKey(userId, documentType, draftKey);
    const onStorage = (event) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue);
        const incoming = parsed?.last_updated ? Date.parse(parsed.last_updated) : 0;
        const current = lastKnownUpdatedAtRef.current ? Date.parse(lastKnownUpdatedAtRef.current) : 0;
        if (incoming > current) {
          lastKnownUpdatedAtRef.current = parsed.last_updated;
          onRestore?.(parsed.form_data || {});
          setStatus(parsed.pending_sync ? "offline" : "saved");
          if (!parsed.pending_sync) {
            setRestoreNotice({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              title: "Newer draft restored",
              description: "A newer draft update was restored from another tab.",
              at: parsed.last_updated || new Date().toISOString(),
            });
          }
          setConflictMessage("");
          setLastSavedAt(parsed.last_updated || new Date().toISOString());
        }
      } catch {
        // ignore malformed storage payload
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [enabled, userId, documentType, draftKey, onRestore]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void saveNow("change");
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [enabled, formData, saveNow]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      void saveNow("interval");
    }, SAVE_INTERVAL_MS);
    const onOnline = () => void saveNow("online");
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, saveNow]);

  const statusLabel = useMemo(() => {
    if (status === "saving") return "Saving...";
    if (status === "saved") return "Saved";
    if (status === "offline") return "Offline - saving locally";
    if (status === "conflict") return conflictMessage || "Conflict detected";
    return "";
  }, [status, conflictMessage]);

  return {
    status,
    hasConflict: status === "conflict",
    conflictMessage,
    restoreNotice,
    statusLabel,
    lastSavedAt,
    saveNow,
    clearDraft,
  };
}
