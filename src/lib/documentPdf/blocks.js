/**
 * Paidly printable document model (engine-agnostic).
 *
 * Document → Page → Blocks → measured height → pagination
 *
 * Document kinds (invoice, quote, later receipt / statement / PO) only differ
 * in which blocks they emit. Pagination never uses a fixed item count.
 */

/** @typedef {'atomic' | 'flow-part'} BlockPolicy */

/**
 * @typedef {object} DocumentBlock
 * @property {string} id
 * @property {string} kind
 * @property {number} heightPx  measured content height (not including page chrome)
 * @property {BlockPolicy} [policy]
 * @property {string | null} [repeatChrome]  e.g. 'line-table' — reserve repeating chrome once per page
 * @property {string | null} [flowGroup]  e.g. 'terms' — parts may continue across pages
 * @property {number} [firstLeadingPx]  heading when this flow group starts
 * @property {number} [continuedLeadingPx]  heading when the group continues on a later page
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @param {Partial<DocumentBlock> & { id: string, kind: string, heightPx: number }} spec
 * @returns {DocumentBlock}
 */
export function createBlock(spec) {
  const heightPx = Math.max(0, Number(spec.heightPx) || 0);
  return {
    id: String(spec.id),
    kind: String(spec.kind),
    heightPx,
    policy: spec.policy === "flow-part" ? "flow-part" : "atomic",
    repeatChrome: spec.repeatChrome ?? null,
    flowGroup: spec.flowGroup ?? null,
    firstLeadingPx: Math.max(0, Number(spec.firstLeadingPx) || 0),
    continuedLeadingPx: Math.max(0, Number(spec.continuedLeadingPx) || 0),
    meta: spec.meta && typeof spec.meta === "object" ? spec.meta : {},
  };
}

/**
 * Page chrome is not content. It is reserved on every page before blocks are packed.
 *
 * @typedef {object} PageChrome
 * @property {number} firstHeaderPx
 * @property {number} continuationHeaderPx
 * @property {number} firstOnlyPx  party/dates band — page 1 only
 * @property {number} footerPx
 */

/**
 * @typedef {object} RepeatChromeMap
 * @property {Record<string, number>} heights  key → px (e.g. { 'line-table': 30 })
 */
