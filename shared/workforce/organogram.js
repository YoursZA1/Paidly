/**
 * Build an organogram from existing manager_membership_id links.
 * Does not create a second hierarchy store.
 */

import { isWorkforceEmployeeActive } from "./employeeLifecycle.js";

/**
 * @param {Array<Record<string, unknown>>} employees
 * @returns {{ roots: Array<Record<string, unknown>>, unassigned: Array<Record<string, unknown>>, cycles: string[], stats: Record<string, number> }}
 */
export function buildOrganogramTree(employees = []) {
  const list = Array.isArray(employees) ? employees.filter((row) => row?.id) : [];
  const byId = new Map();
  for (const row of list) {
    byId.set(String(row.id), {
      id: String(row.id),
      full_name: row.full_name || row.label || row.invited_name || "Employee",
      employee_number: row.employee_number || null,
      job_title: row.job_title || null,
      department: row.department || null,
      role: row.role || null,
      employment_status: row.employment_status || "active",
      manager_membership_id: row.manager_membership_id ? String(row.manager_membership_id) : null,
      active: isWorkforceEmployeeActive(row),
      children: [],
    });
  }

  const cycles = [];
  const roots = [];
  const unassigned = [];

  for (const node of byId.values()) {
    const managerId = node.manager_membership_id;
    if (!managerId) {
      if (node.active) roots.push(node);
      else unassigned.push(node);
      continue;
    }
    if (managerId === node.id) {
      cycles.push(node.id);
      roots.push(node);
      continue;
    }
    const parent = byId.get(managerId);
    if (!parent) {
      // Manager missing from roster — treat as root so the person is still visible.
      roots.push(node);
      continue;
    }
    if (wouldCreateCycle(byId, node.id, managerId)) {
      cycles.push(node.id);
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), undefined, { sensitivity: "base" }));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  sortNodes(unassigned);

  return {
    roots,
    unassigned,
    cycles,
    stats: {
      total: list.length,
      active: list.filter((r) => isWorkforceEmployeeActive(r)).length,
      roots: roots.length,
      unassigned: unassigned.length,
      with_manager: list.filter((r) => r.manager_membership_id).length,
    },
  };
}

/**
 * Walk upward from managerId; if we hit nodeId, linking nodeId→managerId cycles.
 * @param {Map<string, { manager_membership_id?: string|null }>} byId
 * @param {string} nodeId
 * @param {string} managerId
 */
function wouldCreateCycle(byId, nodeId, managerId) {
  let cursor = managerId;
  const seen = new Set();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.manager_membership_id || null;
  }
  return false;
}
