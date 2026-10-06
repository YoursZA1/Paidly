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
    a: ["href", "title", "name", "target", "rel", "style"],
    img: ["src", "alt", "title", "width", "height", "style"],
    td: ["colspan", "rowspan", "align", "valign", "bgcolor", "style"],
    th: ["colspan", "rowspan", "align", "valign", "bgcolor", "style"],
    table: ["border", "cellpadding", "cellspacing", "width", "role", "align", "style"],
    div: ["style"],
    p: ["style"],
    h1: ["style"],
    h2: ["style"],
    span: ["style"],
    "*": ["class"],
  },
  // Inline styles are required for email buttons. Values are an allowlist, so url(), expression(), and scripts cannot pass.
  allowedStyles: {
    "*": {
      color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      "background-color": [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
      background: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i],
      "font-family": [/^[a-z0-9 ,"'-]+$/i],
      "font-size": [/^\d+(?:px|em|%)$/],
      "font-weight": [/^(?:normal|bold|[1-9]00)$/],
      "line-height": [/^(?:normal|\d+(?:\.\d+)?|\d+px)$/],
      "letter-spacing": [/^\d+(?:\.\d+)?px$/],
      "text-align": [/^(?:left|right|center)$/],
      "text-decoration": [/^(?:none|underline)$/],
      "text-transform": [/^(?:none|uppercase|lowercase)$/],
      display: [/^(?:block|inline-block|inline)$/],
      padding: [/^(?:0|\d+px)(?:\s+(?:0|\d+px)){0,3}$/],
      margin: [/^(?:0|auto|\d+px)(?:\s+(?:0|auto|\d+px)){0,3}$/],
      border: [/^\d+px\s+(?:solid|none)\s+#[0-9a-f]{3,6}$/i],
      "border-radius": [/^\d+px$/],
      width: [/^(?:\d+px|\d+%)$/],
      height: [/^(?:auto|\d+px)$/],
      "max-width": [/^\d+px$/],
      "max-height": [/^\d+px$/],
      "word-break": [/^(?:break-all|break-word|normal)$/],
    },
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
