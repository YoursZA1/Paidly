import {
  employeeNeedsAttention,
  workforceLifecycleStatus,
} from "./employeeLifecycle.js";

/**
 * Directory filters shared by the employees API and the SPA.
 * Server list is already scoped to the caller.
 */
export function filterWorkforceDirectory(rows, filters = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const q = String(filters.search || filters.q || "").trim().toLowerCase();
  const department = String(filters.department || "").trim();
  const status = String(filters.status || "").trim();
  const managerId = String(filters.managerId || filters.manager_id || "").trim();
  const jobTitle = String(filters.jobTitle || filters.job_title || "").trim();
  const leaveStatus = String(filters.leaveStatus || filters.leave_status || "").trim();
  const attention = Boolean(filters.attention === true || filters.attention === "1" || filters.attention === "true");
  return list.filter((row) => {
    if (department && row.department !== department) return false;
    if (status === "active" || status === "inactive") {
      if (workforceLifecycleStatus(row) !== status) return false;
    } else if (status && row.employment_status !== status) {
      return false;
    }
    if (managerId === "__none__" && row.manager_membership_id) return false;
    if (managerId === "__inactive__" && row.manager_assignment !== "inactive") return false;
    if (managerId && managerId !== "__none__" && managerId !== "__inactive__" && row.manager_membership_id !== managerId) {
      return false;
    }
    if (jobTitle && row.job_title !== jobTitle) return false;
    if (leaveStatus && (row.leave_status || "none") !== leaveStatus) return false;
    if (attention && !employeeNeedsAttention(row)) return false;
    if (!q) return true;
    const hay = [row.label, row.full_name, row.employee_number, row.email, row.job_title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function sortWorkforceDirectory(rows, sort = "name") {
  const list = Array.isArray(rows) ? [...rows] : [];
  const key = String(sort || "name");
  const text = (value) => String(value || "");
  list.sort((a, b) => {
    if (key === "number") return text(a.employee_number).localeCompare(text(b.employee_number), undefined, { sensitivity: "base" });
    if (key === "title") return text(a.job_title).localeCompare(text(b.job_title), undefined, { sensitivity: "base" });
    if (key === "department") return text(a.department).localeCompare(text(b.department), undefined, { sensitivity: "base" });
    if (key === "start") return text(a.employment_start_date).localeCompare(text(b.employment_start_date));
    if (key === "status") return text(a.employment_status).localeCompare(text(b.employment_status), undefined, { sensitivity: "base" });
    return text(a.full_name || a.label).localeCompare(text(b.full_name || b.label), undefined, { sensitivity: "base" });
  });
  return list;
}

export function leaveStatusLabel(status) {
  if (status === "on_leave") return "On leave";
  if (status === "pending") return "Pending leave";
  if (status === "upcoming") return "Upcoming leave";
  return "None";
}

export function directoryFacets(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const departments = [...new Set(list.map((row) => row.department).filter(Boolean))].sort();
  const job_titles = [...new Set(list.map((row) => row.job_title).filter(Boolean))].sort();
  const byId = new Map();
  for (const row of list) {
    if (!row.manager_membership_id) continue;
    if (!byId.has(row.manager_membership_id)) {
      byId.set(row.manager_membership_id, row.manager_name || "Manager");
    }
  }
  const managers = [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { departments, job_titles, managers };
}

export function paginateRows(rows, { limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  return {
    items: rows.slice(safeOffset, safeOffset + safeLimit),
    total: rows.length,
    limit: safeLimit,
    offset: safeOffset,
  };
}
