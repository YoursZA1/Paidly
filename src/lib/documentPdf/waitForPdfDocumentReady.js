function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function twoFrames() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * Wait until images in `root` have loaded (or failed / timed out).
 * @param {ParentNode | null} root
 * @param {number} [timeoutMs]
 */
export async function waitForPdfImages(root, timeoutMs = 4000) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalHeight > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, timeoutMs);
        })
    )
  );
}

/**
 * Fonts + paint, then images — required before measuring or capturing.
 * @param {ParentNode | null} root
 */
export async function waitForPdfAssets(root) {
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    /* ignore */
  }
  await twoFrames();
  await waitForPdfImages(root);
  await twoFrames();
}

/**
 * Wait until a DocumentPreview capture node has finished pagination.
 * @param {HTMLElement | null} el
 * @param {number} [timeoutMs]
 */
export async function waitUntilElementReady(el, timeoutMs = 10000) {
  if (!el) return null;
  const isDocPreview =
    el.getAttribute("data-paidly-doc-ready") != null ||
    Boolean(el.querySelector?.("[data-paidly-doc-ready]"));
  if (!isDocPreview) {
    await waitForPdfAssets(el);
    return el;
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (el.getAttribute("data-paidly-doc-ready") === "true") {
      await waitForPdfAssets(el);
      return el;
    }
    const nested = el.querySelector?.("[data-paidly-doc-ready='true']");
    if (nested) {
      await waitForPdfAssets(nested);
      return nested;
    }
    await sleep(32);
  }
  await waitForPdfAssets(el);
  return el;
}

/**
 * DocumentPreview sets `data-paidly-doc-ready="true"` after pagination.
 * @param {ParentNode} host
 * @param {number} [timeoutMs]
 * @returns {Promise<HTMLElement | null>}
 */
export async function waitForPdfDocumentReady(host, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el =
      host?.querySelector?.("[data-paidly-doc-ready='true']") ||
      (host?.getAttribute?.("data-paidly-doc-ready") === "true" ? host : null);
    if (el) {
      await waitForPdfAssets(el);
      return el;
    }
    await sleep(32);
  }
  const fallback = host?.querySelector?.(".document-preview-styled") || host?.firstElementChild || host;
  if (fallback) await waitForPdfAssets(fallback);
  return fallback;
}
