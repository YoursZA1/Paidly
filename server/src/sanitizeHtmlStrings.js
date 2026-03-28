import sanitizeHtml from "sanitize-html";

/**
 * No HTML — every tag is removed (script, markup, etc.). Text nodes are kept.
 * Use for fields like `description`, `title`, or notes that must be plain text only.
 *
 * @example
 * const cleanDescription = sanitizeHtml(input.description, {
 *   allowedTags: [],
 *   allowedAttributes: {},
 * });
 */
export const plainTextSanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

/**
 * @param {unknown} value
 * @param {number} [maxLen] — cap before sanitizing (default 50k)
 */
export function sanitizePlainTextField(value, maxLen = 50_000) {
  if (typeof value !== "string") return "";
  const s = value.replace(/\0/g, "").slice(0, maxLen);
  return sanitizeHtml(s, plainTextSanitizeOptions);
}

/**
 * Options for user-supplied HTML on the API (e.g. transactional email bodies).
 * Strips scripts, event handlers, dangerous URLs, and tags outside the allowlist.
 */
const EMAIL_BODY_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "div",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "h1",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "pre",
    "code",
    "ul",
    "ol",
    "li",
    "a",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "col",
    "colgroup",
    "img",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    td: ["colspan", "rowspan", "align", "valign"],
    th: ["colspan", "rowspan", "align", "valign"],
    table: ["border", "cellpadding", "cellspacing", "width", "role"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: attribs.rel || "noopener noreferrer",
        target: attribs.target === "_blank" ? "_blank" : attribs.target,
      },
    }),
  },
};

/**
 * Sanitize HTML strings for safe inclusion in email or storage (XSS mitigation).
 * @param {string} html
 * @param {Record<string, unknown>} [extraOptions] — passed to sanitize-html (tests / stricter mode)
 */
export function sanitizeEmailHtmlContent(html, extraOptions) {
  if (typeof html !== "string" || html.length === 0) return "";
  return sanitizeHtml(html, { ...EMAIL_BODY_OPTIONS, ...extraOptions });
}
