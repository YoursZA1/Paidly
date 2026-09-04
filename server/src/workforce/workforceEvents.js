import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  WORKFORCE_EVENT_TYPES,
  membershipCreatedIdempotencyKey,
} from "../../../shared/workforcePermissions.js";

export { WORKFORCE_EVENT_TYPES, membershipCreatedIdempotencyKey };

const subscribers = [];

export function registerWorkforceSubscriber(eventType, handler) {
  subscribers.push({ eventType, handler });
}

export async function emitWorkforceEvent({
  orgId,
  employeeId,
  eventType,
  actorId = null,
  payload = {},
  idempotencyKey,
  correlationId = null,
}) {
  if (!orgId || !eventType || !idempotencyKey) {
    throw new Error("orgId, eventType, and idempotencyKey are required");
  }

  const insert = {
    org_id: orgId,
    employee_id: employeeId || null,
    event_type: eventType,
    actor_id: actorId,
    payload: payload && typeof payload === "object" ? payload : {},
    idempotency_key: idempotencyKey,
    status: "pending",
  };
  if (correlationId) insert.correlation_id = correlationId;

  const { data, error } = await supabaseAdmin
    .from("workforce_events")
    .insert(insert)
    .select("*")
    .maybeSingle();

  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
    const { data: existing } = await supabaseAdmin
      .from("workforce_events")
      .select("*")
      .eq("org_id", orgId)
      .eq("event_type", eventType)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing?.status === "processed") return existing;
    if (existing) return processWorkforceEvent(existing);
    return existing;
  }
  if (error) {
    if (/workforce_events|schema cache|does not exist/i.test(error.message || "")) {
      const err = new Error("Workforce schema is not applied. Run 20260905120000_workforce_engine_core.sql.");
      err.status = 503;
      err.code = "WORKFORCE_SCHEMA";
      throw err;
    }
    throw error;
  }
  return processWorkforceEvent(data);
}

export async function processWorkforceEvent(row) {
  if (!row?.id) return row;
  if (row.status === "processed") return row;

  const matching = subscribers.filter((s) => s.eventType === row.event_type);
  try {
    for (const sub of matching) {
      await sub.handler(row);
    }
    const { data, error } = await supabaseAdmin
      .from("workforce_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        last_error: null,
        attempts: Number(row.attempts || 0) + 1,
      })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data || { ...row, status: "processed" };
  } catch (err) {
    const message = err?.message || String(err);
    await supabaseAdmin
      .from("workforce_events")
      .update({
        status: "failed",
        last_error: message.slice(0, 500),
        attempts: Number(row.attempts || 0) + 1,
      })
      .eq("id", row.id);
    throw err;
  }
}

export async function retryFailedWorkforceEvents({ limit = 25 } = {}) {
  const { data, error } = await supabaseAdmin
    .from("workforce_events")
    .select("*")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = { processed: 0, failed: 0, skipped: 0 };
  for (const row of data || []) {
    try {
      const out = await processWorkforceEvent(row);
      if (out?.status === "processed") results.processed += 1;
      else results.skipped += 1;
    } catch {
      results.failed += 1;
    }
  }
  return results;
}
