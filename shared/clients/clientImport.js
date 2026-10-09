/**
 * Client Import — pure contract shared by the Clients page and POST /api/company/client-import.
 *
 * Maps only columns that exist on public.clients. There is no separate company-name or
 * client-reference column: a "company" heading maps to `name` (the client). Duplicate checks use
 * email, phone and tax number — never the name alone.
 *
 * Required fields follow the Add Client form (src/pages/EditClient.jsx): a name and a valid email.
 */

export const IGNORE_COLUMN = "__ignore__";

export const CLIENT_IMPORT_ACTIONS = Object.freeze(["create", "update", "skip"]);

/** Rows per request. Matches the catalogue import so a batch stays inside one serverless call. */
export const CLIENT_IMPORT_LIMITS = Object.freeze({
  maxRows: 5000,
  maxFileBytes: 10 * 1024 * 1024,
  commitBatchSize: 100,
  checkBatchSize: 1000,
});

const LENGTH = Object.freeze({
  name: 200,
  contact_person: 200,
  email: 254,
  alternate_email: 254,
  phone: 40,
  fax: 40,
  address: 500,
  tax_id: 40,
  website: 300,
  industry: 100,
  segment: 80,
  notes: 2000,
});

export const CLIENT_IMPORT_FIELDS = Object.freeze([
  { key: "name", label: "Client name", required: true, hint: "The person or organisation. Paidly stores one name." },
  { key: "contact_person", label: "Contact person" },
  { key: "email", label: "Email", required: true, hint: "Needed to send invoices and quotes." },
  { key: "alternate_email", label: "Alternate email" },
  { key: "phone", label: "Phone" },
  { key: "fax", label: "Fax" },
  { key: "address", label: "Address", hint: "Billing and street address are one field." },
  { key: "tax_id", label: "VAT / tax number" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Industry" },
  { key: "segment", label: "Segment" },
  { key: "notes", label: "Notes" },
]);

export const CLIENT_TEMPLATE_HEADERS = Object.freeze([
  "Client name",
  "Contact person",
  "Email",
  "Phone",
  "Address",
  "VAT number",
  "Website",
  "Industry",
  "Notes",
]);

/** Fictional sample rows for the downloadable template. Not real customers. */
export const CLIENT_TEMPLATE_ROWS = Object.freeze([
  ["Thabo Nkosi", "Thabo Nkosi", "thabo@example.co.za", "0825550101", "12 Main Road, Johannesburg", "4123456789", "https://example.co.za", "Retail", "Preferred customer"],
  ["Amina Hassan", "", "amina@example.co.za", "+27 11 555 0199", "4 Oak Avenue, Cape Town", "", "", "Education", ""],
  ["José Muñoz", "José Muñoz", "jose@example.co.za", "0715550142", "8 Harbour Street, Durban", "", "", "Services", ""],
]);

const FIELD_SYNONYMS = Object.freeze({
  name: ["name", "client name", "client", "customer", "customer name", "company", "company name", "business", "business name", "organisation", "organization", "account name", "full name"],
  contact_person: ["contact", "contact person", "contact name", "attention", "attn"],
  email: ["email", "e mail", "email address", "e mail address"],
  alternate_email: ["alternate email", "alt email", "secondary email", "email 2"],
  phone: ["phone", "phone number", "mobile", "mobile number", "cell", "cell number", "telephone", "tel"],
  fax: ["fax", "fax number"],
  address: ["address", "billing address", "physical address", "street", "street address", "postal address"],
  tax_id: ["vat", "vat number", "vat no", "tax", "tax number", "tax id", "tax no", "tin"],
  website: ["website", "web", "url", "site"],
  industry: ["industry", "sector"],
  segment: ["segment", "group"],
  notes: ["notes", "note", "comments", "comment"],
});

const FIELD_EXCLUSIONS = Object.freeze({
  name: /\b(contact|person|attention)\b/,
  email: /\b(alternate|secondary|alt)\b/,
  phone: /\bfax\b/,
  address: /\bemail\b/,
});

const WEAK = new Set(["client", "customer", "company", "business", "contact", "tax", "web", "site", "group", "note"]);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g;
const HTML_TAG = /<\/?[a-zA-Z][^<>]*>/g;
const FORMULA_LIKE = /^[=+@]\s*[A-Za-z_]+\s*\(|^=/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_RE = /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+([/?#].*)?$/i;

export function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[#№]/g, " no ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function containsPhrase(tokens, phraseTokens) {
  outer: for (let i = 0; i + phraseTokens.length <= tokens.length; i++) {
    for (let j = 0; j < phraseTokens.length; j++) {
      if (tokens[i + j] !== phraseTokens[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function scoreHeaderForField(header, field) {
  const h = normalizeHeader(header);
  if (!h) return 0;
  const tokens = h.split(" ");
  const exclusion = FIELD_EXCLUSIONS[field];
  const exact = (FIELD_SYNONYMS[field] || []).includes(h);
  if (exclusion && !exact && exclusion.test(h)) return 0;
  let best = 0;
  for (const syn of FIELD_SYNONYMS[field] || []) {
    const weak = WEAK.has(syn);
    let s = 0;
    if (h === syn) s = weak ? 0.8 : 1;
    else if (containsPhrase(tokens, syn.split(" "))) s = Math.min(0.9, 0.7 + 0.05 * syn.split(" ").length) - (weak ? 0.1 : 0);
    else if (h.length >= 4 && syn.length >= 4) {
      const dist = levenshtein(h, syn);
      const sim = 1 - dist / Math.max(h.length, syn.length);
      if (dist <= 2 && sim >= 0.8) s = weak ? 0.6 : 0.75;
    }
    if (s > best) best = s;
  }
  return best;
}

/** A header line names the client and at least one other client field. */
export function clientLooksLikeHeaderRow(cells) {
  const matched = new Set();
  for (const cell of cells || []) {
    for (const field of CLIENT_IMPORT_FIELDS) {
      if (scoreHeaderForField(cell, field.key) >= 0.8) matched.add(field.key);
    }
  }
  return matched.has("name") && matched.size >= 2;
}

/**
 * Suggest a client field for each column. Each field is used once. Ambiguous seconds are left unmapped.
 * @param {string[]} headers
 */
export function suggestColumnMapping(headers) {
  const list = Array.isArray(headers) ? headers.map((h) => String(h ?? "")) : [];
  const candidates = [];
  list.forEach((header, col) => {
    for (const field of CLIENT_IMPORT_FIELDS) {
      const score = scoreHeaderForField(header, field.key);
      if (score >= 0.6) candidates.push({ col, field: field.key, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const mapping = list.map(() => IGNORE_COLUMN);
  const confidence = list.map(() => "none");
  const notes = list.map(() => null);
  const usedFields = new Set();
  const usedCols = new Set();
  for (const c of candidates) {
    if (usedCols.has(c.col) || usedFields.has(c.field)) {
      if (!usedCols.has(c.col) && usedFields.has(c.field) && c.score >= 0.8 && !notes[c.col]) {
        const label = CLIENT_IMPORT_FIELDS.find((f) => f.key === c.field)?.label || c.field;
        notes[c.col] = `Also looks like ${label}. Pick a field if you need this column.`;
      }
      continue;
    }
    mapping[c.col] = c.field;
    confidence[c.col] = c.score >= 0.95 ? "high" : "medium";
    usedFields.add(c.field);
    usedCols.add(c.col);
  }
  return { mapping, confidence, notes };
}

/** Best client field for one heading, or null. */
export function bestClientField(header) {
  let best = { field: null, score: 0 };
  for (const field of CLIENT_IMPORT_FIELDS) {
    const score = scoreHeaderForField(header, field.key);
    if (score > best.score) best = { field: field.key, score };
  }
  return best.score >= 0.6 ? best.field : null;
}

/**
 * How a client table is rebuilt from a PDF (see src/lib/productImport/pdfTable.js). A line with a
 * name, email, phone or VAT number is always its own client — two clients are never merged. Only
 * address, notes and similar text may wrap onto the row above.
 */
export const CLIENT_PDF_PROFILE = Object.freeze({
  fieldFor: bestClientField,
  keyFields: ["name", "email", "alternate_email", "phone", "tax_id"],
  textFields: ["contact_person", "address", "notes", "industry", "segment", "website", "fax"],
  numericFields: [],
  keepLoneKey: true,
});

export function headerSignature(headers) {
  return (headers || []).map(normalizeHeader).join("|");
}

export function missingRequiredFields(mapping) {
  return CLIENT_IMPORT_FIELDS.filter((f) => f.required && !(mapping || []).includes(f.key)).map((f) => f.key);
}

/**
 * If the file has a title row above the real headings, promote that heading row.
 * @param {{ headers: string[], rows: string[][], rowNumbers?: number[], headerDetected?: boolean }} table
 */
export function promoteClientHeader(table) {
  if (!table) return table;
  const current = suggestColumnMapping(table.headers || []);
  if (current.mapping.includes("name") && clientLooksLikeHeaderRow(table.headers)) return { ...table, headerDetected: true };
  const scan = (table.rows || []).slice(0, 14);
  for (let i = 0; i < scan.length; i++) {
    if (!clientLooksLikeHeaderRow(scan[i])) continue;
    const width = Math.max(scan[i].length, ...(table.rows.slice(i + 1).map((r) => r.length)));
    const headers = Array.from({ length: width }, (_, c) => String(scan[i][c] ?? "").trim() || `Column ${c + 1}`);
    const rows = table.rows.slice(i + 1).map((r) => Array.from({ length: width }, (_, c) => String(r[c] ?? "")));
    const rowNumbers = (table.rowNumbers || []).slice(i + 1);
    return { ...table, headers, rows, rowNumbers, headerDetected: true };
  }
  return table;
}

export function cleanImportText(value, opts = {}) {
  if (value == null) return { text: "", strippedHtml: false, formulaLike: false };
  let s = String(value).normalize("NFC").replace(CONTROL_CHARS, "");
  const withoutTags = s.replace(HTML_TAG, " ");
  const strippedHtml = withoutTags !== s;
  s = withoutTags;
  s = opts.multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  s = s.trim();
  // csvSafeCell() writes '=… / '+… so spreadsheets keep them as text. Undo it on the way back in,
  // so a corrected report re-imports the original value.
  if (/^'[=+\-@]/.test(s)) s = s.slice(1);
  return { text: s, strippedHtml, formulaLike: FORMULA_LIKE.test(s) };
}

/** Lowercased email, or "" when there is nothing to match on. */
export function normalizeEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  return s.includes("@") ? s : "";
}

/**
 * Digits only. 9 or more digits → last 9, so +27 82… and 082… match.
 * 7–8 digits stay as-is. Shorter numbers are not identifiers.
 * Keep this in step with client_import_phone_key() in the migration.
 */
export function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 9) return digits.slice(-9);
  if (digits.length >= 7) return digits;
  return "";
}

export function normalizeTaxId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function identityKeys(value) {
  return {
    email: normalizeEmail(value?.email),
    phone: normalizePhone(value?.phone),
    tax: normalizeTaxId(value?.tax_id),
  };
}

export function applyColumnMapping(mapping, cells) {
  const raw = {};
  (mapping || []).forEach((field, i) => {
    if (!field || field === IGNORE_COLUMN) return;
    const cell = cells?.[i] == null ? "" : String(cells[i]);
    if (!raw[field]) raw[field] = cell;
    else if (cell.trim()) raw[field] = `${raw[field]} ${cell}`.trim();
  });
  return raw;
}

function clip(text, max) {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max).trim(), truncated: true };
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {{ empty: boolean, errors: Array<{field: string, message: string, fix: string}>, warnings: Array<{field: string, message: string}>, value: Record<string, string>, provided: string[] }}
 */
export function validateClientImportRow(raw) {
  const errors = [];
  const warnings = [];
  const value = {};
  const provided = [];
  const source = raw && typeof raw === "object" ? raw : {};

  for (const field of CLIENT_IMPORT_FIELDS) {
    const cleaned = cleanImportText(source[field.key], { multiline: field.key === "notes" || field.key === "address" });
    if (cleaned.strippedHtml) warnings.push({ field: field.key, message: "HTML was removed from this value." });
    if (cleaned.formulaLike) {
      warnings.push({ field: field.key, message: "This looks like a spreadsheet formula. It will be saved as text, not run." });
    }
    const limited = clip(cleaned.text, LENGTH[field.key] || 200);
    if (limited.truncated) warnings.push({ field: field.key, message: `Shortened to ${LENGTH[field.key]} characters.` });
    value[field.key] = limited.text;
    if (limited.text) provided.push(field.key);
  }

  const empty = provided.length === 0;
  if (empty) return { empty: true, errors, warnings, value, provided };

  if (!value.name) {
    errors.push({ field: "name", message: "Client name is required.", fix: "Enter the person or organisation name." });
  }
  if (!value.email) {
    errors.push({ field: "email", message: "Email is required.", fix: "Enter the client's email address so you can send documents." });
  }
  for (const key of ["email", "alternate_email"]) {
    if (value[key] && !EMAIL_RE.test(value[key])) {
      errors.push({ field: key, message: `"${value[key]}" is not a valid email address.`, fix: "Use an address like name@company.co.za, or leave it blank." });
    }
  }
  if (value.phone && !normalizePhone(value.phone)) {
    errors.push({ field: "phone", message: "This phone number is too short.", fix: "Use at least 7 digits, or leave the phone blank." });
  }
  if (value.fax && value.fax.replace(/\D/g, "").length < 7) {
    errors.push({ field: "fax", message: "This fax number is too short.", fix: "Use at least 7 digits, or leave it blank." });
  }
  if (value.website && !WEBSITE_RE.test(value.website)) {
    errors.push({ field: "website", message: "This website doesn't look like a web address.", fix: "Use a domain like example.co.za, or leave it blank." });
  }
  return { empty: false, errors, warnings, value, provided };
}

/**
 * Later rows that share an email, phone or tax number with an earlier row in the same file.
 * @param {Array<{ row_number: number, value: Record<string, string> }>} rows
 * @returns {Map<number, { row_number: number, matchedBy: "email" | "phone" | "tax" }>}
 */
export function fileDuplicates(rows) {
  const first = new Map();
  const out = new Map();
  for (const row of rows || []) {
    const keys = identityKeys(row.value);
    let hit = null;
    const own = [];
    for (const kind of ["email", "phone", "tax"]) {
      const key = keys[kind];
      if (!key) continue;
      const id = `${kind}:${key}`;
      if (!hit && first.has(id)) hit = { row_number: first.get(id), matchedBy: kind === "tax" ? "tax_id" : kind };
      own.push([id, kind]);
    }
    if (hit) out.set(row.row_number, hit);
    else for (const [id] of own) if (!first.has(id)) first.set(id, row.row_number);
  }
  return out;
}

/**
 * Matches inside one business. Reliable only when every identifier points at the same client.
 * Name-only overlap is ignored.
 * @param {Record<string, string>} value
 * @param {Array<{ id: string, name?: string, email?: string, phone?: string, tax_id?: string }>} existing
 */
export function classifyAgainstExisting(value, existing) {
  const keys = identityKeys(value);
  if (!keys.email && !keys.phone && !keys.tax) return null;
  const hits = [];
  for (const client of existing || []) {
    const theirs = identityKeys(client);
    const matchedBy = [];
    if (keys.email && theirs.email === keys.email) matchedBy.push("email");
    if (keys.phone && theirs.phone === keys.phone) matchedBy.push("phone");
    if (keys.tax && theirs.tax === keys.tax) matchedBy.push("tax_id");
    if (matchedBy.length) hits.push({ id: client.id, name: client.name || "", matchedBy });
  }
  if (!hits.length) return null;
  return { reliable: hits.length === 1, matches: hits };
}

export function importRef(importId, rowNumber) {
  return `${importId}:${rowNumber}`;
}

/** Spreadsheet formula injection: a cell that starts with = + - @ tab or CR is text. */
export function csvSafeCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return `\uFEFF${(rows || []).map((r) => r.map(csvSafeCell).join(",")).join("\r\n")}\r\n`;
}

export function safeImportFilename(name) {
  const base = String(name || "clients").split(/[/\\]/).pop() || "clients";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001F]/g, "").trim().slice(0, 180);
  return clean || "clients";
}

/**
 * Report columns reuse the field labels, so a downloaded file of failed rows can be corrected and
 * uploaded again with every value intact. Row / Result / Details are not client fields and map to Ignore.
 */
const REPORT_FIELD_KEYS = CLIENT_IMPORT_FIELDS.map((f) => f.key);

export function clientReportCsv(entries) {
  const lines = [[...CLIENT_IMPORT_FIELDS.map((f) => f.label), "Source row", "Result", "Details"]];
  for (const e of entries || []) {
    lines.push([
      ...REPORT_FIELD_KEYS.map((key) => e.values?.[key] || ""),
      e.row_number ?? "",
      e.result || "",
      e.details || "",
    ]);
  }
  return toCsv(lines);
}

/**
 * What a reviewed row should do before the user changes it.
 * Uncertain matches and in-file duplicates default to skip.
 */
export function defaultDecision(row, fileDup, existingClass) {
  if (row?.errors?.length) return { action: "skip", reason: "invalid", targetId: null, allowDuplicate: false };
  if (fileDup) {
    return { action: "skip", reason: "file_duplicate", targetId: null, allowDuplicate: false, fileRow: fileDup.row_number, matchedBy: fileDup.matchedBy };
  }
  if (existingClass) {
    return {
      action: "skip",
      reason: existingClass.reliable ? "existing" : "uncertain",
      targetId: existingClass.reliable ? existingClass.matches[0].id : null,
      allowDuplicate: false,
      matchedBy: existingClass.matches[0]?.matchedBy?.[0] || null,
    };
  }
  return { action: "create", reason: "new", targetId: null, allowDuplicate: false };
}

export function planCounts(rows, decisions) {
  const counts = { create: 0, update: 0, skip: 0, invalid: 0 };
  for (const row of rows || []) {
    if (row.errors?.length) {
      counts.invalid += 1;
      continue;
    }
    const action = decisions?.get?.(row.row_number)?.action || decisions?.[row.row_number]?.action || "skip";
    if (action === "create") counts.create += 1;
    else if (action === "update") counts.update += 1;
    else counts.skip += 1;
  }
  return counts;
}
