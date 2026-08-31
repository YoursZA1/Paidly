import { createBlock } from "./blocks.js";

/**
 * Pack measured blocks onto pages.
 *
 * Rules:
 * - Never split an `atomic` block (line item, totals, notes, a terms paragraph).
 * - If the next block does not fit, start a new page.
 * - If a single block is taller than an empty page, place it once (no blank-page loop).
 * - Repeating chrome (table header) is reserved when the first matching block lands on a page.
 * - Flow groups (terms) get a first heading, then a continued heading on later pages.
 *
 * @param {object} input
 * @param {import("./blocks.js").DocumentBlock[]} input.blocks
 * @param {number} input.pageBudgetPx
 * @param {number} [input.safetyPx]
 * @param {import("./blocks.js").PageChrome} input.chrome
 * @param {Record<string, number>} [input.repeatChromeHeights]
 * @returns {Array<{
 *   isFirst: boolean,
 *   showFirstOnly: boolean,
 *   blocks: import("./blocks.js").DocumentBlock[],
 *   flowContinued: Record<string, boolean>,
 * }>}
 */
export function paginateBlocks({
  blocks,
  pageBudgetPx,
  safetyPx = 0,
  chrome,
  repeatChromeHeights = {},
}) {
  const list = (Array.isArray(blocks) ? blocks : []).map((b) =>
    createBlock({
      id: b.id,
      kind: b.kind,
      heightPx: b.heightPx,
      policy: b.policy,
      repeatChrome: b.repeatChrome,
      flowGroup: b.flowGroup,
      firstLeadingPx: b.firstLeadingPx,
      continuedLeadingPx: b.continuedLeadingPx,
      meta: b.meta,
    })
  );

  const budget = Math.max(1, Number(pageBudgetPx) || 0) - (Number.isFinite(safetyPx) ? safetyPx : 0);
  const firstHeader = Math.max(0, chrome?.firstHeaderPx || 0);
  const contHeader = Math.max(0, chrome?.continuationHeaderPx || 0);
  const firstOnly = Math.max(0, chrome?.firstOnlyPx || 0);
  const footer = Math.max(0, chrome?.footerPx || 0);

  const chromeUsed = (isFirst) => (isFirst ? firstHeader + firstOnly : contHeader) + footer;

  /** @type {Array<{ isFirst: boolean, showFirstOnly: boolean, blocks: typeof list, flowContinued: Record<string, boolean>, repeating: Set<string>, flowOnPage: Set<string>, used: number }>} */
  const pages = [];
  const flowSeen = new Set();

  const startPage = (isFirst) => ({
    isFirst,
    showFirstOnly: Boolean(isFirst),
    blocks: [],
    flowContinued: {},
    repeating: new Set(),
    flowOnPage: new Set(),
    used: chromeUsed(isFirst),
  });

  const remaining = (p) => budget - p.used;

  const extraFor = (p, block) => {
    let extra = 0;
    if (block.repeatChrome && !p.repeating.has(block.repeatChrome)) {
      extra += Math.max(0, repeatChromeHeights[block.repeatChrome] || 0);
    }
    if (block.flowGroup && !p.flowOnPage.has(block.flowGroup)) {
      extra += flowSeen.has(block.flowGroup) ? block.continuedLeadingPx : block.firstLeadingPx;
    }
    return extra;
  };

  const commit = (p, block, extra) => {
    if (block.repeatChrome) p.repeating.add(block.repeatChrome);
    if (block.flowGroup && !p.flowOnPage.has(block.flowGroup)) {
      p.flowContinued[block.flowGroup] = flowSeen.has(block.flowGroup);
      p.flowOnPage.add(block.flowGroup);
      flowSeen.add(block.flowGroup);
    }
    p.used += extra + Math.max(1, block.heightPx || 1);
    p.blocks.push(block);
  };

  if (list.length === 0) {
    pages.push(startPage(true));
  } else {
    let i = 0;
    let page = startPage(true);
    pages.push(page);

    while (i < list.length) {
      const block = list[i];
      const extra = extraFor(page, block);
      const need = extra + Math.max(1, block.heightPx || 1);

      if (page.blocks.length > 0 && remaining(page) < need) {
        page = startPage(false);
        pages.push(page);
        continue;
      }

      commit(page, block, extra);
      i += 1;
    }
  }

  return pages.map(({ used: _u, repeating: _r, flowOnPage: _f, ...rest }) => rest);
}
