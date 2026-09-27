/**
 * Workforce → POS access for employees (memberships.id): operator list, code status,
 * generate / regenerate / revoke code, enable / disable POS access. Managers only
 * (the caller gates with MANAGE_EMPLOYEES). Never returns a code hash; a plaintext code is
 * returned only by `pos_code_generate`, once.
 */
import { supabaseAdmin } from "../supabaseAdmin.js";
import { writeWorkforceAudit } from "./workforceAudit.js";
import {
  issueMembershipPosCode,
  posCodeSummaries,
  revokeMembershipPosCode,
  setMembershipPosAccessEnabled,
} from "../pos/posAccessCodes.js";
import { membershipIsPosEnabled } from "../../../shared/posStaffInvite.js";

export const POS_ACCESS_ACTIONS = Object.freeze([
  "pos_operators",
  "pos_access_status",
  "pos_code_generate",
  "pos_code_revoke",
  "pos_access_enable",
  "pos_access_disable",
]);

async function loadMembers(orgId, membershipId = null) {
  const select = "id, user_id, role, job_function, pos_register_id, disabled_at, invited_name, invited_email";
  let query = supabaseAdmin.from("memberships").select(`${select}, pos_access_disabled_at`).eq("org_id", orgId);
  if (membershipId) query = query.eq("id", membershipId);
  let { data, error } = await query;
  if (error && /pos_access_disabled_at/i.test(error.message || "")) {
    let retry = supabaseAdmin.from("memberships").select(select).eq("org_id", orgId);
    if (membershipId) retry = retry.eq("id", membershipId);
    ({ data, error } = await retry);
  }
  if (error) throw error;
  return data || [];
}

async function namesFor(members) {
  const userIds = members.map((m) => m.user_id).filter(Boolean);
  const profiles = new Map();
  if (userIds.length) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds);
    for (const p of data || []) profiles.set(p.id, p);
  }
  return (m) => profiles.get(m.user_id)?.full_name || m.invited_name || profiles.get(m.user_id)?.email || m.invited_email || "Employee";
}

async function registerNames(orgId) {
  const { data } = await supabaseAdmin.from("pos_registers").select("id, name").eq("org_id", orgId);
  return new Map((data || []).map((r) => [r.id, r.name]));
}

function isPosMember(m) {
  return membershipIsPosEnabled({ companyRole: m.role, job_function: m.job_function, pos_register_id: m.pos_register_id });
}

function view(m, { name, codes, registers }) {
  const code = codes.get(m.id) || null;
  return {
    membership_id: m.id,
    name,
    role: m.role,
    job_function: m.job_function,
    pos_enabled: isPosMember(m),
    pos_access_disabled: Boolean(m.pos_access_disabled_at),
    employee_disabled: Boolean(m.disabled_at),
    register_id: m.pos_register_id || null,
    register_name: m.pos_register_id ? registers.get(m.pos_register_id) || null : null,
    code: code
      ? {
          status: "active",
          created_at: code.created_at,
          last_used_at: code.last_used_at,
          register_id: code.register_id,
          register_name: code.register_id ? registers.get(code.register_id) || null : null,
        }
      : { status: "none" },
  };
}

async function describe(orgId, members) {
  const [nameOf, codes, registers] = await Promise.all([namesFor(members), posCodeSummaries(orgId, members.map((m) => m.id)), registerNames(orgId)]);
  return members.map((m) => view(m, { name: nameOf(m), codes, registers }));
}

function notFound() {
  const err = new Error("Employee not found");
  err.status = 404;
  err.code = "EMPLOYEE_NOT_FOUND";
  return err;
}

/**
 * @param {string} orgId  from the authenticated manager's membership (never the request body)
 * @param {{ userId?: string }} actor
 * @param {string} action one of POS_ACCESS_ACTIONS
 * @param {string | null} employeeId memberships.id
 * @param {object} body
 */
export async function runPosOperatorAction(orgId, actor, action, employeeId, body = {}) {
  if (action === "pos_operators") {
    const members = (await loadMembers(orgId)).filter((m) => !m.disabled_at && isPosMember(m));
    return { operators: await describe(orgId, members) };
  }

  const [member] = employeeId ? await loadMembers(orgId, employeeId) : [];
  if (!member) throw notFound();

  const audit = (event, after = {}) =>
    writeWorkforceAudit({ orgId, employeeId: member.id, actorId: actor?.userId || null, action: event, after }).catch(() => null);

  if (action === "pos_access_status") {
    const [row] = await describe(orgId, [member]);
    return { pos_access: row };
  }
  if (action === "pos_code_generate") {
    const { code, credential } = await issueMembershipPosCode({
      orgId,
      membershipId: member.id,
      actorUserId: actor?.userId || null,
      registerId: body.register_id || null,
    });
    await audit("pos.code_generated", { credential_id: credential.id });
    const [row] = await describe(orgId, [member]);
    // The only response that ever contains the code. The client shows it once.
    return { code, pos_access: row };
  }
  if (action === "pos_code_revoke") {
    await revokeMembershipPosCode({ orgId, membershipId: member.id, actorUserId: actor?.userId || null });
    await audit("pos.code_revoked");
    const [row] = await describe(orgId, [member]);
    return { pos_access: row };
  }
  if (action === "pos_access_enable" || action === "pos_access_disable") {
    const enabled = action === "pos_access_enable";
    await setMembershipPosAccessEnabled({ orgId, membershipId: member.id, enabled, actorUserId: actor?.userId || null });
    await audit(enabled ? "pos.access_enabled" : "pos.access_disabled");
    const [fresh] = await loadMembers(orgId, member.id);
    const [row] = await describe(orgId, [fresh || member]);
    return { pos_access: row };
  }
  const err = new Error("Unknown POS access action");
  err.status = 400;
  err.code = "UNKNOWN_ACTION";
  throw err;
}
