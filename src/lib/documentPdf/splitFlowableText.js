/**
 * Split long copy (terms, delivery notes) into flowable parts.
 * Empty input → []. Prefers blank-line paragraphs, then single lines.
 * @param {unknown} text
 * @returns {string[]}
 */
export function splitFlowableText(text) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return [];
  const parts = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  const lines = raw
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  return lines.length ? lines : [raw];
}
