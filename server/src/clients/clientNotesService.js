import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  CLIENT_RELATIONSHIP_EVENT_TYPE,
  isManualRelationshipEventType,
} from "../../../shared/clients/clientRelationshipTimeline.js";

function previewOf(body) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function assertBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    const err = new Error("Note text is required");
    err.status = 422;
    err.code = "NOTE_REQUIRED";
    throw err;
  }
  if (text.length > 5000) {
    const err = new Error("Notes must be 5000 characters or fewer");
    err.status = 422;
    err.code = "NOTE_TOO_LONG";
    throw err;
  }
  return text;
}

async function assertClientInOrg(orgId, clientId) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("id, org_id")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const err = new Error("Client not found");
    err.status = 404;
    throw err;
  }
  return data;
}

async function appendRelationshipEvent(row) {
  const { data, error } = await supabaseAdmin
    .from("client_relationship_events")
    .insert(row)
    .select("*")
    .single();
  if (!error) return { event: data, duplicate: false };
  if (error.code === "23505" && row.idempotency_key) {
    const { data: existing } = await supabaseAdmin
      .from("client_relationship_events")
      .select("*")
      .eq("org_id", row.org_id)
      .eq("idempotency_key", row.idempotency_key)
      .maybeSingle();
    if (existing) return { event: existing, duplicate: true };
  }
  throw error;
}

export async function createClientNote(orgId, clientId, actorUserId, body) {
  await assertClientInOrg(orgId, clientId);
  const text = assertBody(body);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("client_notes")
    .insert({
      org_id: orgId,
      client_id: clientId,
      body: text,
      created_by: actorUserId || null,
      updated_by: actorUserId || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw error;
  await appendRelationshipEvent({
    org_id: orgId,
    client_id: clientId,
    event_type: CLIENT_RELATIONSHIP_EVENT_TYPE.note_added,
    actor_type: "user",
    actor_id: actorUserId || null,
    source: "client_notes",
    note_id: data.id,
    occurred_at: now,
    idempotency_key: `note_added:${data.id}`,
    metadata: { note_id: data.id, preview: previewOf(text), source: "client_notes" },
  });
  return data;
}

export async function updateClientNote(orgId, noteId, actorUserId, body) {
  const text = assertBody(body);
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("client_notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", noteId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing || existing.archived_at) {
    const err = new Error("Note not found");
    err.status = 404;
    throw err;
  }
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("client_notes")
    .update({
      body: text,
      updated_by: actorUserId || null,
      updated_at: now,
    })
    .eq("id", noteId)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  await appendRelationshipEvent({
    org_id: orgId,
    client_id: existing.client_id,
    event_type: CLIENT_RELATIONSHIP_EVENT_TYPE.note_updated,
    actor_type: "user",
    actor_id: actorUserId || null,
    source: "client_notes",
    note_id: existing.id,
    occurred_at: now,
    metadata: {
      note_id: existing.id,
      preview: previewOf(text),
      previous_preview: previewOf(existing.body),
      source: "client_notes",
    },
  });
  return data;
}

export async function archiveClientNote(orgId, noteId, actorUserId) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("client_notes")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", noteId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!existing) {
    const err = new Error("Note not found");
    err.status = 404;
    throw err;
  }
  if (existing.archived_at) return existing;
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("client_notes")
    .update({
      archived_at: now,
      updated_by: actorUserId || null,
      updated_at: now,
    })
    .eq("id", noteId)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  await appendRelationshipEvent({
    org_id: orgId,
    client_id: existing.client_id,
    event_type: CLIENT_RELATIONSHIP_EVENT_TYPE.note_archived,
    actor_type: "user",
    actor_id: actorUserId || null,
    source: "client_notes",
    note_id: existing.id,
    occurred_at: now,
    idempotency_key: `note_archived:${existing.id}`,
    metadata: { note_id: existing.id, preview: previewOf(existing.body), source: "client_notes" },
  });
  return data;
}

export async function createManualRelationshipEvent(orgId, clientId, actorUserId, input = {}) {
  await assertClientInOrg(orgId, clientId);
  const eventType = String(input.event_type || input.eventType || "").trim().toLowerCase();
  if (!isManualRelationshipEventType(eventType)) {
    const err = new Error("Unknown relationship event type");
    err.status = 422;
    err.code = "UNKNOWN_RELATIONSHIP_EVENT";
    throw err;
  }
  const note = String(input.note || input.body || "").trim().slice(0, 2000);
  const now = new Date().toISOString();
  const written = await appendRelationshipEvent({
    org_id: orgId,
    client_id: clientId,
    event_type: eventType,
    actor_type: "user",
    actor_id: actorUserId || null,
    source: "manual",
    document_id: input.document_id || input.documentId || null,
    document_type: input.document_type || input.documentType || null,
    occurred_at: input.occurred_at || input.occurredAt || now,
    metadata: {
      source: "manual",
      note: note || null,
      preview: note ? previewOf(note) : null,
    },
  });
  return written.event;
}
