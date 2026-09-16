import { supabaseAdmin } from "../supabaseAdmin.js";
import { requirePosPermission } from "./posConnectionsRoutes.js";
import { PERMISSIONS } from "../companyRouteAccess.js";
import { membershipIsPosEnabled } from "../../../shared/posStaffInvite.js";
import { writeWorkforceAudit } from "../workforce/workforceAudit.js";
import {
  clearPosPinPatch,
  failedPosPinAttemptPatch,
  hashPosPin,
  isPosPinLocked,
  normalizePosPin,
  publicPosPinState,
  successPosPinAttemptPatch,
  verifyPosPinHash,
} from "./posPinCrypto.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function assertPosEnabledMembership(membership) {
  if (
    membershipIsPosEnabled({
      companyRole: membership.companyRole || membership.role,
      jobFunction: membership.jobFunction || membership.job_function,
      posRegisterId: membership.posRegisterId || membership.pos_register_id,
      isOrgOwner: membership.isOrgOwner,
    })
  ) {
    return true;
  }
  const err = new Error("POS PIN is only available for POS-enabled employees");
  err.status = 400;
  err.code = "POS_PIN_NOT_ENABLED";
  throw err;
}

async function loadMembershipPinRow(orgId, membershipId) {
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select(
      "id, org_id, role, job_function, pos_register_id, pos_pin_hash, pos_pin_failed_attempts, pos_pin_locked_until, user_id"
    )
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error && /pos_pin/i.test(error.message || "")) {
    const err = new Error(
      "POS PIN needs a database update. Run supabase/migrations/20260916120000_employee_portal_pos_pin.sql"
    );
    err.status = 503;
    err.code = "WORKFORCE_SCHEMA";
    throw err;
  }
  if (error) throw error;
  return data || null;
}

/**
 * Verify PIN for the authenticated membership in this org. Never trusts client membership ids.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string, code: string }>}
 */
export async function verifyMembershipPosPin(orgId, membershipId, pin) {
  const row = await loadMembershipPinRow(orgId, membershipId);
  if (!row) {
    return { ok: false, status: 404, error: "Employee not found", code: "NOT_FOUND" };
  }
  assertPosEnabledMembership(row);

  if (isPosPinLocked(row)) {
    return {
      ok: false,
      status: 423,
      error: "POS PIN is temporarily locked. Try again later.",
      code: "POS_PIN_LOCKED",
    };
  }

  if (!row.pos_pin_hash) {
    return {
      ok: false,
      status: 422,
      error: "Create a POS PIN before starting a shift",
      code: "POS_PIN_REQUIRED",
    };
  }

  const normalized = normalizePosPin(pin);
  if (!normalized.ok) {
    return { ok: false, status: 422, error: normalized.error, code: normalized.code };
  }

  const match = await verifyPosPinHash(normalized.pin, row.pos_pin_hash);
  if (!match) {
    const patch = failedPosPinAttemptPatch(row);
    await supabaseAdmin
      .from("memberships")
      .update({
        pos_pin_failed_attempts: patch.pos_pin_failed_attempts,
        pos_pin_locked_until: patch.pos_pin_locked_until,
      })
      .eq("id", row.id)
      .eq("org_id", orgId);
    await writeWorkforceAudit({
      orgId,
      employeeId: row.id,
      actorId: row.user_id || null,
      action: patch.locked ? "pos.pin_locked" : "pos.pin_failed",
      after: { attempts: patch.attempts },
    });
    return {
      ok: false,
      status: patch.locked ? 423 : 401,
      error: patch.locked
        ? "POS PIN locked after too many failed attempts"
        : "Incorrect POS PIN",
      code: patch.locked ? "POS_PIN_LOCKED" : "POS_PIN_INVALID",
    };
  }

  await supabaseAdmin
    .from("memberships")
    .update(successPosPinAttemptPatch())
    .eq("id", row.id)
    .eq("org_id", orgId);
  return { ok: true };
}

export async function handlePosPinGet(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
  if (!gate.ok) return gate.response;
  if (!gate.membership?.id) return jsonError(res, 403, "No company membership");

  try {
    assertPosEnabledMembership(gate.membership);
    const row = await loadMembershipPinRow(gate.membership.orgId, gate.membership.id);
    return res.status(200).json({
      ok: true,
      ...publicPosPinState(row),
      pos_access: true,
    });
  } catch (err) {
    return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
  }
}

export async function handlePosPinSet(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
  if (!gate.ok) return gate.response;
  if (!gate.membership?.id) return jsonError(res, 403, "No company membership");
  if (gate.user?.id == null && !gate.membership?.userId) {
    return jsonError(res, 403, "POS PIN requires a Paidly account", { code: "POS_PIN_AUTH_REQUIRED" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    assertPosEnabledMembership(gate.membership);
    const row = await loadMembershipPinRow(gate.membership.orgId, gate.membership.id);
    if (!row) return jsonError(res, 404, "Employee not found");

    if (isPosPinLocked(row)) {
      return jsonError(res, 423, "POS PIN is temporarily locked. Try again later.", {
        code: "POS_PIN_LOCKED",
      });
    }

    const next = normalizePosPin(body.pin);
    if (!next.ok) return jsonError(res, 422, next.error, { code: next.code });
    const confirm = body.confirm_pin != null ? normalizePosPin(body.confirm_pin) : next;
    if (!confirm.ok || confirm.pin !== next.pin) {
      return jsonError(res, 422, "PIN confirmation does not match", { code: "POS_PIN_MISMATCH" });
    }

    if (row.pos_pin_hash) {
      const current = normalizePosPin(body.current_pin);
      if (!current.ok) {
        return jsonError(res, 422, "Current POS PIN is required to change it", {
          code: "POS_PIN_CURRENT_REQUIRED",
        });
      }
      const match = await verifyPosPinHash(current.pin, row.pos_pin_hash);
      if (!match) {
        const patch = failedPosPinAttemptPatch(row);
        await supabaseAdmin
          .from("memberships")
          .update({
            pos_pin_failed_attempts: patch.pos_pin_failed_attempts,
            pos_pin_locked_until: patch.pos_pin_locked_until,
          })
          .eq("id", row.id)
          .eq("org_id", gate.membership.orgId);
        return jsonError(
          res,
          patch.locked ? 423 : 401,
          patch.locked ? "POS PIN locked after too many failed attempts" : "Incorrect current POS PIN",
          { code: patch.locked ? "POS_PIN_LOCKED" : "POS_PIN_INVALID" }
        );
      }
    }

    const hash = await hashPosPin(next.pin);
    const { error } = await supabaseAdmin
      .from("memberships")
      .update({
        pos_pin_hash: hash,
        pos_pin_updated_at: new Date().toISOString(),
        ...successPosPinAttemptPatch(),
      })
      .eq("id", row.id)
      .eq("org_id", gate.membership.orgId);
    if (error) throw error;

    await writeWorkforceAudit({
      orgId: gate.membership.orgId,
      employeeId: row.id,
      actorId: gate.user?.id || gate.membership.userId,
      action: row.pos_pin_hash ? "pos.pin_changed" : "pos.pin_created",
      after: { pos_pin_set: true },
    });

    return res.status(200).json({
      ok: true,
      pos_pin_set: true,
      pos_pin_locked: false,
    });
  } catch (err) {
    return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
  }
}

export { clearPosPinPatch, publicPosPinState };
