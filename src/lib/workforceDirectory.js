/**
 * Client-side Workforce directory filters. Server list is already scoped to the caller.
 * @param {Array<{ label?: string, full_name?: string, employee_number?: string, email?: string, job_title?: string, department?: string, employment_status?: string, manager_membership_id?: string }>} rows
 * @param {{ search?: string, department?: string, status?: string, managerId?: string }} filters
 */
export function filterWorkforceDirectory(rows, filters = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const q = String(filters.search || "").trim().toLowerCase();
  const department = String(filters.department || "").trim();
  const status = String(filters.status || "").trim();
  const managerId = String(filters.managerId || "").trim();
  return list.filter((row) => {
    if (department && row.department !== department) return false;
    if (status && row.employment_status !== status) return false;
    if (managerId && row.manager_membership_id !== managerId) return false;
    if (!q) return true;
    const hay = [row.label, row.full_name, row.employee_number, row.email, row.job_title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
