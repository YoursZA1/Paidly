/**
 * Payslip CSV mapping for Payslip_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export. allowances and other_deductions stored as JSON in CSV.
 */

/** CSV column headers matching Payslip_export.csv */
export const PAYSLIP_CSV_HEADERS = [
  "payslip_number",
  "employee_name",
  "employee_id",
  "employee_email",
  "employee_phone",
  "position",
  "department",
  "pay_period_start",
  "pay_period_end",
  "pay_date",
  "basic_salary",
  "overtime_hours",
  "overtime_rate",
  "allowances",
  "gross_pay",
  "tax_deduction",
  "uif_deduction",
  "pension_deduction",
  "medical_aid_deduction",
  "other_deductions",
  "total_deductions",
  "net_pay",
  "status",
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

function jsonToCsv(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val) || typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/**
 * Build a CSV row from a payslip record (matches Payslip_export.csv).
 * @param {Object} payslip - Payslip from Payroll entity / public.payslips
 */
export function payslipToCsvRow(payslip) {
  const createdDate = toIsoStr(payslip.created_at || payslip.created_date);
  const updatedDate = toIsoStr(payslip.updated_at || payslip.updated_date);
  const allowancesStr = jsonToCsv(payslip.allowances);
  const otherDeductionsStr = jsonToCsv(payslip.other_deductions);
  return [
    payslip.payslip_number ?? "",
    payslip.employee_name ?? "",
    payslip.employee_id ?? "",
    payslip.employee_email ?? "",
    payslip.employee_phone ?? "",
    payslip.position ?? "",
    payslip.department ?? "",
    toDateStr(payslip.pay_period_start),
    toDateStr(payslip.pay_period_end),
    toDateStr(payslip.pay_date),
    payslip.basic_salary ?? "",
    payslip.overtime_hours ?? "",
    payslip.overtime_rate ?? "",
    allowancesStr,
    payslip.gross_pay ?? "",
    payslip.tax_deduction ?? "",
    payslip.uif_deduction ?? "",
    payslip.pension_deduction ?? "",
    payslip.medical_aid_deduction ?? "",
    otherDeductionsStr,
    payslip.total_deductions ?? "",
    payslip.net_pay ?? "",
    payslip.status ?? "draft",
    payslip.id ?? "",
    createdDate,
    updatedDate,
    payslip.created_by_id ?? "",
    payslip.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Payroll.create.
 */
export function csvRowToPayslipPayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const status = (row.status || "draft").trim() || "draft";
  let allowances = [];
  try {
    if (row.allowances) allowances = JSON.parse(row.allowances);
  } catch {
    allowances = [];
  }
  if (!Array.isArray(allowances)) allowances = [];
  let otherDeductions = [];
  try {
    if (row.other_deductions) otherDeductions = JSON.parse(row.other_deductions);
  } catch {
    otherDeductions = [];
  }
  if (!Array.isArray(otherDeductions)) otherDeductions = [];

  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const payload = {
    payslip_number: (row.payslip_number || "").trim() || undefined,
    employee_name: (row.employee_name || "").trim() || undefined,
    employee_id: (row.employee_id || "").trim() || undefined,
    employee_email: (row.employee_email || "").trim() || undefined,
    employee_phone: (row.employee_phone || "").trim() || undefined,
    position: (row.position || "").trim() || undefined,
    department: (row.department || "").trim() || undefined,
    pay_period_start: (row.pay_period_start || "").trim() || undefined,
    pay_period_end: (row.pay_period_end || "").trim() || undefined,
    pay_date: (row.pay_date || "").trim() || undefined,
    basic_salary: num(row.basic_salary) ?? 0,
    overtime_hours: num(row.overtime_hours) ?? 0,
    overtime_rate: num(row.overtime_rate) ?? 0,
    allowances,
    gross_pay: num(row.gross_pay) ?? 0,
    tax_deduction: num(row.tax_deduction) ?? 0,
    uif_deduction: num(row.uif_deduction) ?? 0,
    pension_deduction: num(row.pension_deduction) ?? 0,
    medical_aid_deduction: num(row.medical_aid_deduction) ?? 0,
    other_deductions: otherDeductions,
    total_deductions: num(row.total_deductions) ?? 0,
    net_pay: num(row.net_pay) ?? 0,
    status,
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parsePayslipCsv(csvText) {
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
 * Build full CSV string for payslips list.
 * @param {Array} payslips - Payslips from Payroll.list()
 */
export function payslipsToCsv(payslips) {
  const headerLine = PAYSLIP_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = payslips.map((p) =>
    payslipToCsvRow(p).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
