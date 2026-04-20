/**
 * Backend-enforced danger-zone workflows:
 * POST /api/admin/system/maintenance
 * POST /api/admin/system/reset
 */

import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../../../server/src/adminRouteAccess.js";
import { applyPaidlyServerlessCors } from "../../../../server/src/vercelPaidlyCors.js";
import { validateServiceRoleKey } from "../../../../server/src/supabaseServiceRoleGuard.js";

function getAction(req) {
  const q = String(req.query?.action ?? "").trim();
  if (q) return q;
  const path = String(req.url || "").split("?")[0] || "";
  const marker = "/api/admin/system/";
  const idx = path.indexOf(marker);
  if (idx === -1) return "";
  return decodeURIComponent(path.slice(idx + marker.length)).replace(/\/$/, "");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { client: null, configError: "Server misconfigured (Supabase)." };
  const roleCheck = validateServiceRoleKey?.(key) ?? { ok: true };
  if (!roleCheck.ok) return { client: null, configError: roleCheck.message };
  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    configError: null,
  };
}

async function requireAdminOrManagement(req, res, supabase) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowTeamManagement: true });
  if (deny) {
    res.status(deny.status).json(deny.body);
    return null;
  }
  return authData.user;
}

function parseBody(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return null;
    }
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Missing request body" });
    return null;
  }
  if (String(body.confirmation || "").trim() !== "CONFIRM") {
    res.status(400).json({ error: 'Confirmation required: set confirmation to "CONFIRM"' });
    return null;
  }
  return body;
}

async function writeAuditLog(supabase, payload) {
  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}

async function getSystemStateSnapshot(supabase) {
  const { data, error } = await supabase
    .from("admin_system_state")
    .select("id, maintenance_mode, last_reset_at, updated_by, updated_at, reset_reason")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Snapshot failed: ${error.message}`);
  return data || null;
}

async function rollbackSystemState(supabase, snapshot) {
  if (!snapshot) return;
  const { error } = await supabase.from("admin_system_state").upsert(
    {
      id: true,
      maintenance_mode: Boolean(snapshot.maintenance_mode),
      last_reset_at: snapshot.last_reset_at || null,
      updated_by: snapshot.updated_by || null,
      updated_at: snapshot.updated_at || new Date().toISOString(),
      reset_reason: snapshot.reset_reason || null,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Rollback failed: ${error.message}`);
}

async function handleMaintenance(req, res, supabase, actor, body) {
  const enabled = Boolean(body.enabled);
  const reason = String(body.reason || "").trim() || null;
  const now = new Date().toISOString();

  let snapshot = null;
  try {
    snapshot = await getSystemStateSnapshot(supabase);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Could not snapshot system state" });
  }

  const { data, error } = await supabase
    .from("admin_system_state")
    .upsert(
      {
        id: true,
        maintenance_mode: enabled,
        updated_by: actor.id,
        updated_at: now,
        reset_reason: reason,
      },
      { onConflict: "id" }
    )
    .select("maintenance_mode, updated_at, updated_by")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message || "Failed to update maintenance state" });
  }

  try {
    await writeAuditLog(supabase, {
      category: "settings",
      action: "system_maintenance_updated",
      actor_id: actor.id,
      actor_email: actor.email || null,
      actor_name: actor.user_metadata?.full_name || null,
      actor_role: actor.app_metadata?.role || null,
      entity: "system",
      metadata: { enabled, reason },
      description: enabled
        ? "Maintenance mode enabled from danger zone."
        : "Maintenance mode disabled from danger zone.",
      before: snapshot
        ? {
            maintenance_mode: snapshot.maintenance_mode,
            last_reset_at: snapshot.last_reset_at,
            reset_reason: snapshot.reset_reason,
          }
        : null,
      after: { maintenance_mode: enabled, reason },
      created_at: now,
    });
  } catch (auditErr) {
    try {
      await rollbackSystemState(supabase, snapshot);
    } catch (rollbackErr) {
      return res.status(500).json({
        error: `Audit failed and rollback failed: ${auditErr.message}; ${rollbackErr.message}`,
      });
    }
    return res.status(500).json({ error: auditErr.message || "Audit write failed; system change reverted" });
  }

  return res.status(200).json({ ok: true, state: data });
}

async function handleReset(req, res, supabase, actor, body) {
  const reason = String(body.reason || "").trim() || null;
  const now = new Date().toISOString();

  let snapshot = null;
  try {
    snapshot = await getSystemStateSnapshot(supabase);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Could not snapshot system state" });
  }

  const { data, error } = await supabase
    .from("admin_system_state")
    .upsert(
      {
        id: true,
        maintenance_mode: false,
        last_reset_at: now,
        updated_by: actor.id,
        updated_at: now,
        reset_reason: reason,
      },
      { onConflict: "id" }
    )
    .select("maintenance_mode, last_reset_at, updated_at, updated_by")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message || "Failed to reset system state" });
  }

  try {
    await writeAuditLog(supabase, {
      category: "settings",
      action: "system_reset_executed",
      actor_id: actor.id,
      actor_email: actor.email || null,
      actor_name: actor.user_metadata?.full_name || null,
      actor_role: actor.app_metadata?.role || null,
      entity: "system",
      metadata: { reason },
      description: "System reset workflow executed from danger zone.",
      before: snapshot
        ? {
            maintenance_mode: snapshot.maintenance_mode,
            last_reset_at: snapshot.last_reset_at,
            reset_reason: snapshot.reset_reason,
          }
        : null,
      after: { maintenance_mode: false, last_reset_at: now, reason },
      created_at: now,
    });
  } catch (auditErr) {
    try {
      await rollbackSystemState(supabase, snapshot);
    } catch (rollbackErr) {
      return res.status(500).json({
        error: `Audit failed and rollback failed: ${auditErr.message}; ${rollbackErr.message}`,
      });
    }
    return res.status(500).json({ error: auditErr.message || "Audit write failed; system change reverted" });
  }

  return res.status(200).json({ ok: true, state: data });
}

export default async function handler(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = getAction(req);
  if (!["maintenance", "reset"].includes(action)) {
    return res.status(404).json({ error: "Unknown system action" });
  }

  const { client: supabase, configError } = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });
  }

  const actor = await requireAdminOrManagement(req, res, supabase);
  if (!actor) return;

  const body = parseBody(req, res);
  if (!body) return;

  try {
    if (action === "maintenance") return await handleMaintenance(req, res, supabase, actor, body);
    return await handleReset(req, res, supabase, actor, body);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "System workflow failed" });
  }
}
