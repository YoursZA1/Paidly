/**
 * Presentation helper: consecutive packed blocks become one UI run
 * (line items → one table, terms-part → one terms section).
 *
 * Pagination itself never groups; this is only for rendering a Page.
 *
 * @param {import("./blocks.js").DocumentBlock[]} blocks
 */
export function pageBlockRuns(blocks) {
  const TABLE = new Set(["line-item", "line-item-empty"]);
  const runs = [];
  for (const block of blocks || []) {
    const last = runs[runs.length - 1];
    if (TABLE.has(block.kind)) {
      if (last?.type === "table") last.blocks.push(block);
      else runs.push({ type: "table", blocks: [block] });
      continue;
    }
    if (block.flowGroup) {
      if (last?.type === "flow" && last.group === block.flowGroup) last.blocks.push(block);
      else runs.push({ type: "flow", group: block.flowGroup, blocks: [block] });
      continue;
    }
    runs.push({ type: "block", block });
  }
  return runs;
}
