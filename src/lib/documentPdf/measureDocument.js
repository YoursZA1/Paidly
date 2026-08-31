import { createBlock } from "./blocks.js";

function pxOf(el) {
  if (!el) return 0;
  return Math.ceil(el.getBoundingClientRect().height);
}

/**
 * Read repeating chrome (table header, etc.) from the measure tree.
 * @param {ParentNode} root
 * @returns {Record<string, number>}
 */
export function measureRepeatChrome(root) {
  const out = {};
  if (!root?.querySelectorAll) return out;
  root.querySelectorAll("[data-doc-repeat-chrome-measure]").forEach((el) => {
    const key = el.getAttribute("data-doc-repeat-chrome-measure");
    if (key) out[key] = pxOf(el);
  });
  return out;
}

/**
 * Page chrome: header / first-only band / footer. Not packed as content blocks.
 * @param {ParentNode} root
 */
export function measurePageChrome(root) {
  return {
    firstHeaderPx: pxOf(root.querySelector('[data-doc-chrome="first-header"]')),
    continuationHeaderPx: pxOf(root.querySelector('[data-doc-chrome="continuation-header"]')),
    firstOnlyPx: pxOf(root.querySelector('[data-doc-chrome="first-only"]')),
    footerPx: pxOf(root.querySelector('[data-doc-chrome="footer"]')),
  };
}

function flowLeading(root, group, continued) {
  if (!group) return 0;
  const sel = continued
    ? `[data-doc-flow-continued="${group}"]`
    : `[data-doc-flow-leading="${group}"]`;
  return pxOf(root.querySelector(sel));
}

/**
 * Content blocks in document order, heights from the live layout.
 * @param {ParentNode} root
 * @returns {import("./blocks.js").DocumentBlock[]}
 */
export function measureContentBlocks(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll("[data-doc-block]")].map((el) => {
    const kind = el.getAttribute("data-doc-block") || "block";
    const id = el.getAttribute("data-doc-block-id") || kind;
    const flowGroup = el.getAttribute("data-doc-flow-group") || null;
    let meta = {};
    try {
      meta = JSON.parse(el.getAttribute("data-doc-meta") || "{}");
    } catch {
      meta = {};
    }
    return createBlock({
      id,
      kind,
      heightPx: pxOf(el),
      policy: el.getAttribute("data-doc-policy") === "flow-part" ? "flow-part" : "atomic",
      repeatChrome: el.getAttribute("data-doc-repeat-chrome") || null,
      flowGroup,
      firstLeadingPx: flowLeading(root, flowGroup, false),
      continuedLeadingPx: flowLeading(root, flowGroup, true),
      meta,
    });
  });
}
