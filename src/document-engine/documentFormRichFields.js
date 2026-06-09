/** Shared constants + JSON helpers for rich typed-document form fields. */

export const RATING_SCALE = Object.freeze([
  { value: "1", label: "1", description: "Needs improvement" },
  { value: "2", label: "2", description: "Below expectations" },
  { value: "3", label: "3", description: "Meets expectations" },
  { value: "4", label: "4", description: "Exceeds expectations" },
  { value: "5", label: "5", description: "Outstanding" },
]);

export const PERFORMANCE_COMPETENCIES = Object.freeze([
  { key: "communication", label: "Communication" },
  { key: "teamwork", label: "Teamwork & collaboration" },
  { key: "quality", label: "Quality of work" },
  { key: "initiative", label: "Initiative & ownership" },
  { key: "reliability", label: "Reliability & attendance" },
  { key: "growth", label: "Learning & growth" },
]);

export const DEFAULT_CHECKLIST_STARTER_LABELS = Object.freeze([
  "Review scope and requirements",
  "Confirm resources are allocated",
  "Complete safety / compliance checks",
  "Brief the team on responsibilities",
  "Sign off and archive documentation",
]);

/** @typedef {{ id: string, label: string, checked: boolean, note?: string }} ChecklistItem */

/** @returns {ChecklistItem} */
export function emptyChecklistItem(label = "") {
  return {
    id: crypto.randomUUID(),
    label,
    checked: false,
    note: "",
  };
}

/** @param {unknown} raw @returns {ChecklistItem[]} */
export function parseChecklistField(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeChecklistItem).filter(Boolean);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeChecklistItem).filter(Boolean);
  } catch {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => emptyChecklistItem(label));
  }
}

/** @param {unknown} item */
function normalizeChecklistItem(item) {
  if (!item || typeof item !== "object") return null;
  const label = String(item.label ?? "").trim();
  if (!label) return null;
  return {
    id: String(item.id || crypto.randomUUID()),
    label,
    checked: Boolean(item.checked),
    note: String(item.note ?? ""),
  };
}

/** @param {ChecklistItem[]} items */
export function serializeChecklistField(items) {
  return JSON.stringify(
    (items || []).map((item) => ({
      id: item.id,
      label: item.label,
      checked: Boolean(item.checked),
      note: item.note || "",
    }))
  );
}

/** @param {string[]} labels @returns {ChecklistItem[]} */
export function checklistItemsFromLabels(labels) {
  return (labels || []).map((label) => emptyChecklistItem(label));
}

/** @param {unknown} raw @returns {Record<string, string>} */
export function parseRatingMatrixField(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, String(v ?? "")])
    );
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])
    );
  } catch {
    return {};
  }
}

/** @param {Record<string, string>} matrix */
export function serializeRatingMatrixField(matrix) {
  return JSON.stringify(matrix || {});
}

/** @param {{ key: string }[]} competencies */
export function emptyRatingMatrix(competencies) {
  const matrix = {};
  for (const c of competencies || []) matrix[c.key] = "";
  return matrix;
}

/** @param {unknown} value */
export function ratingLabel(value) {
  const match = RATING_SCALE.find((r) => r.value === String(value));
  return match ? `${match.label} — ${match.description}` : "—";
}

/** @param {ChecklistItem[]} items */
export function checklistProgress(items) {
  const rows = items || [];
  const done = rows.filter((i) => i.checked).length;
  return { done, total: rows.length };
}
