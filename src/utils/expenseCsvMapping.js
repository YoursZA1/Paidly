/**
 * Expense CSV mapping for Expense_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching Expense_export.csv */
export const EXPENSE_CSV_HEADERS = [
  "expense_number",
  "category",
  "description",
  "amount",
  "date",
  "payment_method",
  "vendor",
  "receipt_url",
  "is_claimable",
  "claimed",
  "notes",
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

function toBoolStr(val) {
  if (val === true || val === "true" || val === "1") return "true";
  return "false";
}

/**
 * Build a CSV row from an expense record (matches Expense_export.csv).
 * @param {Object} expense - Expense from Expense entity / public.expenses
 */
export function expenseToCsvRow(expense) {
  const createdDate = toIsoStr(expense.created_at || expense.created_date);
  const updatedDate = toIsoStr(expense.updated_at || expense.updated_date);
  return [
    expense.expense_number ?? "",
    expense.category ?? "",
    expense.description ?? "",
    expense.amount ?? "",
    toDateStr(expense.date),
    expense.payment_method ?? "",
    expense.vendor ?? "",
    expense.receipt_url ?? "",
    toBoolStr(expense.is_claimable),
    toBoolStr(expense.claimed),
    expense.notes ?? "",
    expense.id ?? "",
    createdDate,
    updatedDate,
    expense.created_by_id ?? "",
    expense.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Expense.create.
 */
export function csvRowToExpensePayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const payload = {
    expense_number: (row.expense_number || "").trim() || undefined,
    category: (row.category || "").trim() || undefined,
    description: (row.description || "").trim() || undefined,
    amount: num(row.amount) ?? 0,
    date: (row.date || "").trim() || undefined,
    payment_method: (row.payment_method || "").trim() || undefined,
    vendor: (row.vendor || "").trim() || undefined,
    receipt_url: (row.receipt_url || "").trim() || undefined,
    is_claimable: row.is_claimable === "true" || row.is_claimable === "1",
    claimed: row.claimed === "true" || row.claimed === "1",
    notes: (row.notes || "").trim() || undefined,
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseExpenseCsv(csvText) {
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
 * Build full CSV string for expenses list.
 * @param {Array} expenses - Expenses from Expense.list()
 */
export function expensesToCsv(expenses) {
  const headerLine = EXPENSE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = expenses.map((e) =>
    expenseToCsvRow(e).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
