import DOMPurify from 'dompurify';

/**
 * Escape text for HTML text nodes and quoted attributes.
 */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Allow only http(s) URLs (absolute or resolved against base). Blocks javascript:, data:, etc.
 */
export function sanitizeHttpUrl(url, baseOrigin) {
  if (url == null || url === '') return '';
  const s = String(url).trim();
  if (!s) return '';
  try {
    const base =
      baseOrigin && /^https?:\/\//i.test(String(baseOrigin))
        ? String(baseOrigin)
        : typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://invalid.invalid';
    const u = new URL(s, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

let messagePurifyHooksInstalled = false;

function installMessagePurifyHooks() {
  if (messagePurifyHooksInstalled) return;
  messagePurifyHooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
}

/**
 * Sanitize rich text (e.g. React Quill / stored thread messages) before dangerouslySetInnerHTML.
 */
export function sanitizeMessageHtml(dirty) {
  if (dirty == null) return '';
  const s = String(dirty);
  if (!s.trim()) return '';
  if (typeof window === 'undefined') {
    return escapeHtml(s);
  }
  installMessagePurifyHooks();
  return DOMPurify.sanitize(s, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'del',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'blockquote',
      'pre',
      'code',
      'span',
    ],
    ALLOWED_ATTR: ['href', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}

/** Recharts config keys become CSS custom property names — restrict to safe identifiers. */
export function sanitizeChartSeriesKey(key) {
  const k = String(key ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  return k || null;
}

/** Only allow literal color values injected into &lt;style&gt; (blocks `};` breakout). */
export function sanitizeCssColorLiteral(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?([0-9A-Fa-f]{2})?$/.test(s)) return s;
  if (
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0(\.\d+)?|1(\.0+)?|\.\d+))?\s*\)$/.test(
      s
    )
  ) {
    return s;
  }
  if (
    /^hsla?\(\s*\d+\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0(\.\d+)?|1(\.0+)?|\.\d+))?\s*\)$/.test(
      s
    )
  ) {
    return s;
  }
  if (/^(transparent|currentcolor|inherit|initial|unset)$/i.test(s)) return s;
  return null;
}
