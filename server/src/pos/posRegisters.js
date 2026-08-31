import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidUuid } from "../inputValidation.js";
import { requireSettingsManager, requirePosPermission } from "./posConnectionsRoutes.js";
import { PERMISSIONS } from "../companyRouteAccess.js";
import { registerHasOpenSession } from "./posRegisterSessions.js";
import {
  normalizeRegisterWrite,
  publicRegisterView,
  findConflictingRegister,
} from "./posRegisterMath.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function mapRegisterSchemaError(message) {
  const msg = String(message || "");
  if (/pos_registers|register_id|opening_balance|assigned_staff_id|company_id/i.test(msg) && /schema cache|does not exist|could not find the/i.test(msg)) {
    return "POS registers need a database update. Run scripts/apply-native-pos.sql in the Supabase SQL Editor.";
  }
  if (/idx_pos_registers_org_brand_name|idx_pos_registers_org_name|duplicate key/i.test(msg)) {
    return "A register with this name already exists for this brand.";
  }
  return msg || "Could not save register";
}

const REGISTER_SELECT =
  "id, org_id, company_id, name, status, assigned_staff_id, opening_balance, created_by, created_at, updated_at";

async function loadBrandNameMap(orgId, companyIds) {
  const ids = [...new Set((companyIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .eq("org_id", orgId)
    .in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row.name]));
}

async function loadStaffMap(orgId, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

async function listOrgMembers(orgId) {
  const { data: memberships, error: memError } = await supabaseAdmin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId);
  if (memError) throw memError;
  const ids = new Set((memberships || []).map((row) => row.user_id).filter(Boolean));
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (org?.owner_id) ids.add(org.owner_id);
  if (ids.size === 0) return [];
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...ids]);
  if (profileError) throw profileError;
  return (profiles || []).map((row) => ({
    id: row.id,
    name: row.full_name || row.email || "Team member",
    email: row.email || null,
  }));
}

async function assertBrandInOrg(orgId, companyId) {
  if (!companyId) return true;
  if (!isValidUuid(companyId)) return false;
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data?.id);
}

async function assertStaffInOrg(orgId, userId) {
  if (!userId) return true;
  if (!isValidUuid(userId)) return false;
  const { data: membership } = await supabaseAdmin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.user_id) return true;
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();
  return org?.owner_id === userId;
}

async function findNameConflict(orgId, { name, companyId, excludeId }) {
  const { data, error } = await supabaseAdmin
    .from("pos_registers")
    .select(REGISTER_SELECT)
    .eq("org_id", orgId);
  if (error) throw error;
  return findConflictingRegister(data || [], {
    name,
    companyId: companyId || null,
    excludeId: excludeId || null,
  });
}

function duplicateNameError(res, existing) {
  return jsonError(res, 409, "A register with this name already exists for this brand.", {
    code: "REGISTER_NAME_TAKEN",
    existing_id: existing?.id || null,
  });
}

export async function decorateRegisters(orgId, rows) {
  const brands = await loadBrandNameMap(orgId, (rows || []).map((row) => row.company_id));
  const staff = await loadStaffMap(orgId, (rows || []).map((row) => row.assigned_staff_id));
  return (rows || []).map((row) => {
    const person = row.assigned_staff_id ? staff.get(row.assigned_staff_id) : null;
    return publicRegisterView(row, {
      company_name: row.company_id ? brands.get(row.company_id) || null : null,
      assigned_staff_name: person?.full_name || null,
      assigned_staff_email: person?.email || null,
    });
  });
}

export async function ensureDefaultPosRegister(orgId, userId) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("pos_registers")
    .select(REGISTER_SELECT)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (lookupError) throw lookupError;
  if (existing?.[0]?.id) return existing[0];

  const { data: brand } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("pos_registers")
    .insert({
      org_id: orgId,
      company_id: brand?.id || null,
      name: "Main till",
      status: "active",
      assigned_staff_id: userId || null,
      opening_balance: 0,
      created_by: userId || null,
    })
    .select(REGISTER_SELECT)
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("pos_registers")
        .select(REGISTER_SELECT)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (raced?.[0]?.id) return raced[0];
    }
    throw insertError;
  }
  return inserted;
}

export async function resolveCheckoutRegister(orgId, userId, registerId) {
  if (registerId) {
    if (!isValidUuid(registerId)) {
      return { ok: false, error: "register_id is invalid", code: "REGISTER_INVALID" };
    }
    const { data, error } = await supabaseAdmin
      .from("pos_registers")
      .select(REGISTER_SELECT)
      .eq("id", registerId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "Register not found", code: "REGISTER_NOT_FOUND" };
    if (data.status !== "active") {
      return { ok: false, error: "This register is disabled", code: "REGISTER_DISABLED" };
    }
    return { ok: true, register: data };
  }

  const fallback = await ensureDefaultPosRegister(orgId, userId);
  if (fallback.status !== "active") {
    const { data: active } = await supabaseAdmin
      .from("pos_registers")
      .select(REGISTER_SELECT)
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!active?.id) {
      return { ok: false, error: "No active register. Enable a till in Settings → Integrations.", code: "REGISTER_DISABLED" };
    }
    return { ok: true, register: active };
  }
  return { ok: true, register: fallback };
}

/**
 * GET /api/pos/registers
 */
export async function handlePosRegistersList(req, res) {
  const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
  if (!gate.ok) return gate.response;

  const orgId = gate.membership.orgId;
  try {
    const { data, error } = await supabaseAdmin
      .from("pos_registers")
      .select(REGISTER_SELECT)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error) return jsonError(res, 500, mapRegisterSchemaError(error.message));

    const registers = await decorateRegisters(orgId, data || []);
    const members = await listOrgMembers(orgId);
    return res.status(200).json({ registers, members });
  } catch (err) {
    return jsonError(res, 500, mapRegisterSchemaError(err?.message));
  }
}

/**
 * POST /api/pos/registers
 */
export async function handlePosRegisterCreate(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const parsed = normalizeRegisterWrite(body, { partial: false });
  if (!parsed.ok) return jsonError(res, 422, parsed.error, { code: parsed.code });

  const orgId = gate.membership.orgId;
  try {
    if (!(await assertBrandInOrg(orgId, parsed.data.company_id))) {
      return jsonError(res, 422, "Brand is not in this organization", { code: "BRAND_INVALID" });
    }
    if (!(await assertStaffInOrg(orgId, parsed.data.assigned_staff_id))) {
      return jsonError(res, 422, "Assigned staff must be an organization member", { code: "STAFF_INVALID" });
    }

    const conflict = await findNameConflict(orgId, {
      name: parsed.data.name,
      companyId: parsed.data.company_id,
    });
    if (conflict) return duplicateNameError(res, conflict);

    const { data, error } = await supabaseAdmin
      .from("pos_registers")
      .insert({
        org_id: orgId,
        created_by: gate.user.id,
        ...parsed.data,
      })
      .select(REGISTER_SELECT)
      .single();
    if (error) {
      if (error.code === "23505") return duplicateNameError(res, null);
      return jsonError(res, 500, mapRegisterSchemaError(error.message));
    }

    const [view] = await decorateRegisters(orgId, [data]);
    return res.status(201).json({ register: view });
  } catch (err) {
    return jsonError(res, 500, mapRegisterSchemaError(err?.message));
  }
}

/**
 * PATCH /api/pos/registers/:id
 */
export async function handlePosRegisterPatch(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const id = String(req.params?.id || "").trim();
  if (!isValidUuid(id)) return jsonError(res, 422, "Register id is required");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const parsed = normalizeRegisterWrite(body, { partial: true });
  if (!parsed.ok) return jsonError(res, 422, parsed.error, { code: parsed.code });
  if (Object.keys(parsed.data).length === 0) {
    return jsonError(res, 422, "No register fields to update");
  }

  const orgId = gate.membership.orgId;
  try {
    if (parsed.data.company_id !== undefined && !(await assertBrandInOrg(orgId, parsed.data.company_id))) {
      return jsonError(res, 422, "Brand is not in this organization", { code: "BRAND_INVALID" });
    }
    if (parsed.data.assigned_staff_id !== undefined && !(await assertStaffInOrg(orgId, parsed.data.assigned_staff_id))) {
      return jsonError(res, 422, "Assigned staff must be an organization member", { code: "STAFF_INVALID" });
    }

    if (parsed.data.name != null || parsed.data.company_id !== undefined) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from("pos_registers")
        .select("id, name, company_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (currentError) return jsonError(res, 500, mapRegisterSchemaError(currentError.message));
      if (!current) return jsonError(res, 404, "Register not found");
      const conflict = await findNameConflict(orgId, {
        name: parsed.data.name ?? current.name,
        companyId: parsed.data.company_id !== undefined ? parsed.data.company_id : current.company_id,
        excludeId: id,
      });
      if (conflict) return duplicateNameError(res, conflict);
    }

    const { data, error } = await supabaseAdmin
      .from("pos_registers")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId)
      .select(REGISTER_SELECT)
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return duplicateNameError(res, null);
      return jsonError(res, 500, mapRegisterSchemaError(error.message));
    }
    if (!data) return jsonError(res, 404, "Register not found");

    const [view] = await decorateRegisters(orgId, [data]);
    return res.status(200).json({ register: view });
  } catch (err) {
    return jsonError(res, 500, mapRegisterSchemaError(err?.message));
  }
}

/**
 * DELETE /api/pos/registers/:id — disable rather than destroy sales history.
 */
export async function handlePosRegisterDelete(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const id = String(req.params?.id || "").trim();
  if (!isValidUuid(id)) return jsonError(res, 422, "Register id is required");

  const orgId = gate.membership.orgId;
  const { count, error: countError } = await supabaseAdmin
    .from("pos_registers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active");
  if (countError) return jsonError(res, 500, mapRegisterSchemaError(countError.message));

  const { data: row, error: loadError } = await supabaseAdmin
    .from("pos_registers")
    .select("id, status")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (loadError) return jsonError(res, 500, mapRegisterSchemaError(loadError.message));
  if (!row) return jsonError(res, 404, "Register not found");

  if (row.status === "active" && Number(count) <= 1) {
    return jsonError(res, 422, "Keep at least one active register", { code: "LAST_REGISTER" });
  }

  try {
    const open = await registerHasOpenSession(orgId, id);
    if (!open.ok) return jsonError(res, 500, mapRegisterSchemaError(open.error));
    if (open.open) {
      return jsonError(res, 422, "Close the shift before disabling this register", { code: "SESSION_OPEN" });
    }
  } catch (err) {
    if (!/pos_register_sessions|session_id/i.test(err?.message || "")) {
      return jsonError(res, 500, mapRegisterSchemaError(err?.message));
    }
  }

  const { data, error } = await supabaseAdmin
    .from("pos_registers")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .select(REGISTER_SELECT)
    .maybeSingle();
  if (error) return jsonError(res, 500, mapRegisterSchemaError(error.message));

  const [view] = await decorateRegisters(orgId, [data]);
  return res.status(200).json({ register: view });
}
