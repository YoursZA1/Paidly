/**
 * Client-side Workforce directory filters. Server list is already scoped to the caller.
 * @param {Array<{ label?: string, full_name?: string, employee_number?: string, email?: string, job_title?: string, department?: string, employment_status?: string, manager_membership_id?: string, leave_status?: string }>} rows
 * @param {{ search?: string, department?: string, status?: string, managerId?: string, jobTitle?: string, leaveStatus?: string }} filters
 */
export function filterWorkforceDirectory(rows, filters = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const q = String(filters.search || "").trim().toLowerCase();
  const department = String(filters.department || "").trim();
  const status = String(filters.status || "").trim();
  const managerId = String(filters.managerId || "").trim();
  const jobTitle = String(filters.jobTitle || "").trim();
  const leaveStatus = String(filters.leaveStatus || "").trim();
  return list.filter((row) => {
    if (department && row.department !== department) return false;
    if (status && row.employment_status !== status) return false;
    if (managerId && row.manager_membership_id !== managerId) return false;
    if (jobTitle && row.job_title !== jobTitle) return false;
    if (leaveStatus && (row.leave_status || "none") !== leaveStatus) return false;
    if (!q) return true;
    const hay = [row.label, row.full_name, row.employee_number, row.email, row.job_title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} [sort]
 */
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
