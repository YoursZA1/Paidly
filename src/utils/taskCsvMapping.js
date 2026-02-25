/**
 * Task CSV mapping for Task_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching Task_export.csv */
export const TASK_CSV_HEADERS = [
  "title",
  "description",
  "client_id",
  "assigned_to",
  "due_date",
  "priority",
  "status",
  "category",
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
  "is_sample",
];

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

function toDateStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toIsoStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  } catch {
    return "";
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(str) {
  return str && typeof str === "string" && UUID_REGEX.test(str.trim());
}

/**
 * Build a CSV row from a task record (matches Task_export.csv).
 * @param {Object} task - Task from Task entity / public.tasks
 */
export function taskToCsvRow(task) {
  const createdDate = toIsoStr(task.created_at || task.created_date);
  const updatedDate = toIsoStr(task.updated_at || task.updated_date);
  return [
    task.title ?? "",
    task.description ?? "",
    task.client_id ?? "",
    task.assigned_to ?? "",
    toDateStr(task.due_date),
    task.priority ?? "medium",
    task.status ?? "pending",
    task.category ?? "other",
    task.id ?? "",
    createdDate,
    updatedDate,
    task.created_by_id ?? "",
    task.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Task.create.
 * client_id is only set when it is a valid UUID (DB column references public.clients).
 */
export function csvRowToTaskPayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const clientId = (row.client_id || "").trim();
  const payload = {
    title: (row.title || "").trim() || undefined,
    description: (row.description || "").trim() || undefined,
    client_id: isValidUuid(clientId) ? clientId : undefined,
    assigned_to: (row.assigned_to || "").trim() || undefined,
    due_date: (row.due_date || "").trim() || undefined,
    priority: (row.priority || "medium").trim() || "medium",
    status: (row.status || "pending").trim() || "pending",
    category: (row.category || "other").trim() || "other",
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseTaskCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (c === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (c === "," || c === "\n" || c === "\r")) {
      if (c === ",") {
        currentRow.push(cell);
        cell = "";
      } else {
        if (c === "\r" && csvText[i + 1] === "\n") i++;
        currentRow.push(cell);
        cell = "";
        if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
        currentRow = [];
      }
    } else {
      cell += c;
    }
  }
  currentRow.push(cell);
  if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0];
  return { headers, rows: rows.slice(1) };
}

/**
 * Build full CSV string for tasks list.
 * @param {Array} tasks - Tasks from Task.list()
 */
export function tasksToCsv(tasks) {
  const headerLine = TASK_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = tasks.map((t) =>
    taskToCsvRow(t).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
