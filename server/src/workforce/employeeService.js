import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeCompanyRole, normalizeJobFunction, COMPANY_ROLES, membershipHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
import { isPosStaffInviteRequest, POS_JOB_FUNCTION } from "../../../shared/posStaffInvite.js";
import { buildEmployeeNumber, nextEmployeeSequence } from "../../../shared/payroll/payslipNumber.js";
import { companyInviteShareUrl } from "../companyInviteAppUrl.js";
import { sendCompanyTeamInviteEmail } from "../companyTeamInviteDelivery.js";
import {
  emitWorkforceEvent,
  WORKFORCE_EVENT_TYPES,
  membershipCreatedIdempotencyKey,
} from "./workforceEvents.js";
import { provisionEmployeeWorkforce, registerWorkforceSubscribers } from "./employeeProvisioning.js";
import { johannesburgYmd } from "../../../shared/payroll/dates.js";
import { sanitizeEmployeeWritePayload, parseManagerMembershipId } from "../../../shared/workforce/employeeWrite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { assertSameOrg } from "./workforceAuth.js";
import { throwIfMissingWorkforceColumn } from "./schemaGuard.js";
import { writeWorkforceAudit } from "./workforceAudit.js";
import {
  isEligibleWorkforceManager,
  isWorkforceEmployeeActive,
  lifecyclePatchForAction,
  normalizeEmploymentLifecycleAction,
} from "../../../shared/workforce/employeeLifecycle.js";

registerWorkforceSubscribers();

const MANAGER_LOOKUP_COLS = "id, org_id, role, job_function, employment_status, disabled_at";

function lifecycleForbidden(message, code = "LIFECYCLE") {
  const err = new Error(message);
  err.status = 400;
  err.code = code;
  return err;
}

async function loadOrgManager(orgId, managerId) {
  const { data: manager } = await supabaseAdmin
    .from("memberships")
    .select(MANAGER_LOOKUP_COLS)
    .eq("id", managerId)
    .eq("org_id", orgId)
    .maybeSingle();
  return manager || null;
}

async function assertEligibleManager(orgId, managerId, { employeeId } = {}) {
  if (!managerId) return null;
  if (employeeId && managerId === employeeId) {
    throw lifecycleForbidden("An employee cannot manage themselves", "SELF_MANAGER");
  }
  const manager = await loadOrgManager(orgId, managerId);
  if (!manager?.id) {
    const err = new Error("manager_membership_id is not in your company");
    err.status = 403;
    err.code = "ORG_MISMATCH";
    throw err;
  }
  if (!isEligibleWorkforceManager(manager, { excludeId: employeeId })) {
    throw lifecycleForbidden(
      "Only an active manager can be assigned. Inactive managers cannot receive new employees.",
      "MANAGER_INACTIVE"
    );
  }
  return manager;
}

async function countDirectReports(orgId, managerId) {
  const { count, error } = await supabaseAdmin
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("manager_membership_id", managerId);
  if (error) return 0;
  return count || 0;
}

async function syncDerivedLifecycle(orgId, employeeId, active) {
  const { data: profile } = await supabaseAdmin
    .from("payroll_profiles")
    .select("id, payroll_status")
    .eq("membership_id", employeeId)
    .eq("org_id", orgId)
    .maybeSingle();
  const payrollPatch = {
    employment_status: active ? "active" : "inactive",
  };
  if (!active && String(profile?.payroll_status || "") === "active") {
    payrollPatch.payroll_status = "paused";
  }
  if (active && String(profile?.payroll_status || "") === "paused") {
    payrollPatch.payroll_status = "active";
  }
  await supabaseAdmin
    .from("payroll_profiles")
    .update(payrollPatch)
    .eq("membership_id", employeeId)
    .eq("org_id", orgId);
  try {
    await supabaseAdmin
      .from("attendance_profiles")
      .update({ status: active ? "active" : "inactive" })
      .eq("employee_id", employeeId);
  } catch {
    // Attendance is a stub; missing table must not block HR lifecycle.
  }
}

async function writeLifecycleAudits({ orgId, actor, existing, patch }) {
  const employeeId = existing.id;
  const actorId = actor.userId;
  if (patch.department !== undefined && patch.department !== existing.department) {
    await writeWorkforceAudit({
      orgId,
      employeeId,
      actorId,
      action: "department.changed",
      before: { department: existing.department || null },
      after: { department: patch.department || null },
    });
  }
  if (patch.manager_membership_id !== undefined) {
    const previous = existing.manager_membership_id || null;
    const next = patch.manager_membership_id || null;
    if (previous !== next) {
      const action = !previous ? "manager.assigned" : !next ? "manager.removed" : "manager.changed";
      await writeWorkforceAudit({
        orgId,
        employeeId,
        actorId,
        action,
        before: { manager_membership_id: previous },
        after: { manager_membership_id: next },
      });
    }
  }
  if (patch.disabled_at !== undefined || patch.employment_status !== undefined) {
    const wasActive = isWorkforceEmployeeActive(existing);
    const nextActive = isWorkforceEmployeeActive({
      ...existing,
      ...patch,
    });
    if (wasActive && !nextActive) {
      await writeWorkforceAudit({
        orgId,
        employeeId,
        actorId,
        action: "employee.deactivated",
        before: { employment_status: existing.employment_status, disabled_at: existing.disabled_at || null },
        after: { employment_status: patch.employment_status, disabled_at: patch.disabled_at || null },
      });
    } else if (!wasActive && nextActive) {
      await writeWorkforceAudit({
        orgId,
        employeeId,
        actorId,
        action: "employee.activated",
        before: { employment_status: existing.employment_status, disabled_at: existing.disabled_at || null },
        after: { employment_status: patch.employment_status, disabled_at: null },
      });
    }
  }
}

function hashInviteToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

async function nextOrgEmployeeNumber(orgId) {
  const { data } = await supabaseAdmin
    .from("memberships")
    .select("employee_number")
    .eq("org_id", orgId);
  const used = (data || []).map((row) => row.employee_number).filter(Boolean);
  return buildEmployeeNumber(nextEmployeeSequence(used));
}

export {
  listEmployees,
  getEmployee,
  getEmployeeProfile,
  workforceSummary,
  listEligibleManagers,
} from "./employeeListQuery.js";

async function persistPortalInvite({ orgId, email, role, jobFunction, actorId, membershipId, invitedName }) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    email,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    org_id: orgId,
    token,
    token_hash: hashInviteToken(token),
    status: "pending",
    expires_at: expiresAt,
    created_by: actorId,
    source: "company_admin",
    job_function: jobFunction,
    membership_id: membershipId,
    invited_name: invitedName || null,
  };
  const { data, error } = await supabaseAdmin.from("company_invites").insert(row).select("id").maybeSingle();
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
    const { data: existing } = await supabaseAdmin
      .from("company_invites")
      .select("id, token, expires_at")
      .eq("org_id", orgId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing?.token) {
      return {
        id: existing.id,
        token: existing.token,
        expiresAt: existing.expires_at,
        inviteLink: companyInviteShareUrl(existing.token),
      };
    }
  }
  if (error) {
    throwIfMissingWorkforceColumn(error, "membership_id");
    throw error;
  }
  return {
    id: data?.id,
    token,
    expiresAt,
    inviteLink: companyInviteShareUrl(token),
  };
}

export async function createEmployee(orgId, actor, payload = {}) {
  const safe = sanitizeEmployeeWritePayload(payload);
  const email = String(safe.email || "").trim().toLowerCase();
  const fullName = String(safe.full_name || safe.fullName || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("Enter a valid email address");
    err.status = 400;
    throw err;
  }

  let role = normalizeCompanyRole(safe.role);
  let jobFunction = normalizeJobFunction(safe.job_function ?? safe.jobFunction ?? "general");
  if (isPosStaffInviteRequest({ role, jobFunction, source: safe.source })) {
    const err = new Error("POS staff must be invited from Team or the till, not Workforce create.");
    err.status = 422;
    err.code = "POS_INVITE_PATH";
    throw err;
  }
  if (role === COMPANY_ROLES.ADMIN && actor.companyRole !== COMPANY_ROLES.ADMIN) {
    const err = new Error("Only a company admin can create another admin.");
    err.status = 403;
    throw err;
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile?.id === actor.userId) {
    const err = new Error("You cannot add yourself");
    err.status = 400;
    throw err;
  }

  const managerId = parseManagerMembershipId(safe.manager_membership_id || safe.managerMembershipId);
  if (managerId) {
    await assertEligibleManager(orgId, managerId);
  }

  const employeeNumber = await nextOrgEmployeeNumber(orgId);
  const membershipRow = {
    org_id: orgId,
    user_id: existingProfile?.id || null,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    job_function: jobFunction === POS_JOB_FUNCTION ? "general" : jobFunction,
    employee_number: employeeNumber,
    department: String(safe.department || "").trim() || null,
    employment_status: "active",
    invited_email: email,
    invited_name: fullName || null,
    job_title: String(safe.job_title || safe.jobTitle || "").trim() || null,
    manager_membership_id: managerId || null,
  };

  const inserted = await supabaseAdmin
    .from("memberships")
    .insert(membershipRow)
    .select("id, user_id")
    .maybeSingle();

  if (inserted.error && existingProfile?.id && /duplicate|unique/i.test(inserted.error.message || "")) {
    const { data: existingMem } = await supabaseAdmin
      .from("memberships")
      .select("id, user_id")
      .eq("org_id", orgId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMem?.id) {
      await emitWorkforceEvent({
        orgId,
        employeeId: existingMem.id,
        eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
        actorId: actor.userId,
        payload: { source: "existing_membership" },
        idempotencyKey: membershipCreatedIdempotencyKey(existingMem.id),
      });
      return { employee: await getEmployee(orgId, existingMem.id, { canViewTeam: true }), mode: "existing_member" };
    }
  }
  if (inserted.error && /invited_name|job_title/i.test(inserted.error.message || "")) {
    delete membershipRow.invited_name;
    delete membershipRow.job_title;
    const retry = await supabaseAdmin.from("memberships").insert(membershipRow).select("id, user_id").maybeSingle();
    inserted.error = retry.error;
    inserted.data = retry.data;
  }
  if (inserted.error && /manager_membership_id/i.test(inserted.error.message || "")) {
    delete membershipRow.manager_membership_id;
    const retry = await supabaseAdmin.from("memberships").insert(membershipRow).select("id, user_id").maybeSingle();
    inserted.error = retry.error;
    inserted.data = retry.data;
  }
  if (inserted.error) {
    if (/user_id|not-null|null value/i.test(inserted.error.message || "")) {
      const err = new Error(
        "Workforce schema is not applied. Run 20260905120000_workforce_engine_core.sql in the Supabase SQL Editor."
      );
      err.status = 503;
      err.code = "WORKFORCE_SCHEMA";
      throw err;
    }
    throw inserted.error;
  }

  const employeeId = inserted.data.id;
  try {
    await provisionEmployeeWorkforce(orgId, employeeId);
  } catch (err) {
    console.warn("[workforce] immediate provision failed:", err?.message || err);
  }
  await emitWorkforceEvent({
    orgId,
    employeeId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
    actorId: actor.userId,
    payload: { source: "create_employee", email },
    idempotencyKey: membershipCreatedIdempotencyKey(employeeId),
  });

  let invite = null;
  if (existingProfile?.id) {
    await emitWorkforceEvent({
      orgId,
      employeeId,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED,
      actorId: actor.userId,
      payload: { source: "existing_user" },
      idempotencyKey: `membership:${employeeId}:portal_activated`,
    });
  } else {
    invite = await persistPortalInvite({
      orgId,
      email,
      role,
      jobFunction,
      actorId: actor.userId,
      membershipId: employeeId,
      invitedName: fullName || null,
    });
    const { data: orgRow } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    await sendCompanyTeamInviteEmail({
      to: email,
      inviteLink: invite.inviteLink,
      companyName: orgRow?.name || "your company",
      inviterName: "Your team admin",
      roleLabel: role,
    });
    await emitWorkforceEvent({
      orgId,
      employeeId,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_INVITED,
      actorId: actor.userId,
      payload: { invite_id: invite.id },
      idempotencyKey: `membership:${employeeId}:portal_invited`,
    });
  }

  return {
    employee: await getEmployee(orgId, employeeId, { canViewTeam: true }),
    mode: existingProfile?.id ? "existing_user" : "invited",
    invite_link: invite?.inviteLink || null,
  };
}

export async function updateEmployee(orgId, actor, employeeId, payload = {}) {
  const id = parseUuid(employeeId);
  if (!id) {
    const err = new Error("Employee id is required");
    err.status = 400;
    throw err;
  }
  const safe = sanitizeEmployeeWritePayload(payload);
  const { data: existing } = await supabaseAdmin
    .from("memberships")
    .select(
      "id, org_id, user_id, department, employment_status, employment_start_date, employment_end_date, manager_membership_id, employee_number, job_title, disabled_at, invited_name"
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing?.id) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  assertSameOrg({ companyId: orgId }, existing);

  const managerId = parseManagerMembershipId(safe.manager_membership_id || safe.managerMembershipId);
  if (managerId) {
    await assertEligibleManager(orgId, managerId, { employeeId: id });
  }

  const lifecycleAction = normalizeEmploymentLifecycleAction(safe);
  const patch = {};
  if (safe.department !== undefined) patch.department = String(safe.department || "").trim() || null;
  if (safe.job_title !== undefined || safe.jobTitle !== undefined) {
    patch.job_title = String(safe.job_title || safe.jobTitle || "").trim() || null;
  }
  if (safe.invited_name !== undefined || safe.full_name !== undefined || safe.fullName !== undefined) {
    const name = String(safe.invited_name || safe.full_name || safe.fullName || "").trim() || null;
    if (name) patch.invited_name = name;
  }
  if (safe.employment_start_date !== undefined) {
    patch.employment_start_date = safe.employment_start_date || null;
  }
  if (safe.employment_end_date !== undefined && !lifecycleAction) {
    patch.employment_end_date = safe.employment_end_date || null;
  }
  if (safe.manager_membership_id !== undefined || safe.managerMembershipId !== undefined) {
    patch.manager_membership_id = managerId || null;
  }
  if (lifecycleAction) {
    const todayIso = johannesburgYmd().iso;
    Object.assign(patch, lifecyclePatchForAction(lifecycleAction, { todayIso }));
    if (lifecycleAction === "deactivate" && existing.employment_end_date) {
      patch.employment_end_date = existing.employment_end_date;
    }
  } else if (safe.employment_status !== undefined) {
    patch.employment_status = String(safe.employment_status || "active").trim() || "active";
  }

  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("memberships").update(patch).eq("id", id).eq("org_id", orgId);
    if (error && /job_title|invited_name|disabled_at/i.test(error.message || "")) {
      const fallback = { ...patch };
      if (/job_title/i.test(error.message || "")) delete fallback.job_title;
      if (/invited_name/i.test(error.message || "")) delete fallback.invited_name;
      if (/disabled_at/i.test(error.message || "")) delete fallback.disabled_at;
      const retry = await supabaseAdmin.from("memberships").update(fallback).eq("id", id).eq("org_id", orgId);
      if (retry.error) throw retry.error;
    } else if (error) {
      throw error;
    }
  }

  if (existing.user_id && (safe.phone !== undefined || safe.full_name !== undefined || safe.fullName !== undefined)) {
    const profilePatch = {};
    if (safe.phone !== undefined) profilePatch.phone = String(safe.phone || "").trim() || null;
    if (safe.full_name !== undefined || safe.fullName !== undefined) {
      const name = String(safe.full_name || safe.fullName || "").trim() || null;
      if (name) profilePatch.full_name = name;
    }
    if (Object.keys(profilePatch).length) {
      await supabaseAdmin.from("profiles").update(profilePatch).eq("id", existing.user_id);
    }
  }

  await writeLifecycleAudits({ orgId, actor, existing, patch });

  if (lifecycleAction === "deactivate") {
    await syncDerivedLifecycle(orgId, id, false);
    await emitWorkforceEvent({
      orgId,
      employeeId: id,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_TERMINATED,
      actorId: actor.userId,
      payload: { fields: Object.keys(patch), reports_kept: true },
      idempotencyKey: `membership:${id}:deactivated:${Date.now()}`,
    });
  } else if (lifecycleAction === "activate") {
    await syncDerivedLifecycle(orgId, id, true);
    await emitWorkforceEvent({
      orgId,
      employeeId: id,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_ACTIVATED,
      actorId: actor.userId,
      payload: { fields: Object.keys(patch) },
      idempotencyKey: `membership:${id}:activated:${Date.now()}`,
    });
  }

  await emitWorkforceEvent({
    orgId,
    employeeId: id,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED,
    actorId: actor.userId,
    payload: { fields: Object.keys(patch) },
    idempotencyKey: `membership:${id}:updated:${Date.now()}`,
  });

  const employee = await getEmployee(orgId, id, {
    actorUserId: actor.userId,
    actorMembershipId: actor.id,
    canViewTeam: true,
    canManagePayroll: membershipHasPermission(actor, PERMISSIONS.MANAGE_PAYROLL),
  });
  if (lifecycleAction === "deactivate") {
    employee.reports_needing_reassignment = await countDirectReports(orgId, id);
  }
  return employee;
}

export async function reassignManagerReports(orgId, actor, payload = {}) {
  const fromId = parseUuid(payload.from_manager_id || payload.fromManagerId);
  const toId = parseManagerMembershipId(payload.manager_membership_id || payload.to_manager_id || payload.toManagerId);
  if (!fromId) {
    const err = new Error("from_manager_id is required");
    err.status = 400;
    throw err;
  }
  if (!toId) {
    const err = new Error("Assign an active manager");
    err.status = 400;
    throw err;
  }
  if (fromId === toId) {
    const err = new Error("Choose a different manager");
    err.status = 400;
    throw err;
  }
  await assertEligibleManager(orgId, toId);

  const { data: reports, error } = await supabaseAdmin
    .from("memberships")
    .select("id, manager_membership_id")
    .eq("org_id", orgId)
    .eq("manager_membership_id", fromId);
  if (error) throw error;
  const ids = (reports || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) {
    return { updated: 0, from_manager_id: fromId, manager_membership_id: toId };
  }

  const { error: updateError } = await supabaseAdmin
    .from("memberships")
    .update({ manager_membership_id: toId })
    .eq("org_id", orgId)
    .eq("manager_membership_id", fromId);
  if (updateError) throw updateError;

  for (const employeeId of ids) {
    await writeWorkforceAudit({
      orgId,
      employeeId,
      actorId: actor.userId,
      action: "manager.changed",
      before: { manager_membership_id: fromId },
      after: { manager_membership_id: toId, bulk: true },
    });
    await emitWorkforceEvent({
      orgId,
      employeeId,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED,
      actorId: actor.userId,
      payload: { fields: ["manager_membership_id"], bulk: true },
      idempotencyKey: `membership:${employeeId}:manager_reassign:${Date.now()}`,
    });
  }

  return { updated: ids.length, from_manager_id: fromId, manager_membership_id: toId, employee_ids: ids };
}

export async function emitEmployeeCreatedForMembership(orgId, membershipId, actorId) {
  if (!orgId || !membershipId) return null;
  return emitWorkforceEvent({
    orgId,
    employeeId: membershipId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
    actorId,
    payload: { source: "membership_upsert" },
    idempotencyKey: membershipCreatedIdempotencyKey(membershipId),
  });
}

export async function emitEmployeePortalActivated(orgId, membershipId, actorId) {
  if (!orgId || !membershipId) return null;
  return emitWorkforceEvent({
    orgId,
    employeeId: membershipId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED,
    actorId,
    payload: { source: "invite_accept" },
    idempotencyKey: `membership:${membershipId}:portal_activated`,
  });
}
