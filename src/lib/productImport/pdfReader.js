/**
 * Product Import — positioned text out of a PDF. pdf.js is passed in (browser build in the app,
 * legacy build in tests). Scanned pages have no text layer; for those the caller may run OCR with
 * the on-device tesseract.js already used by Scan Receipt (self-hosted under /vendor/tesseract).
 */

export const MAX_PDF_PAGES = 50;
export const MAX_OCR_PAGES = 5;
const OCR_SCALE = 2;
const OCR_TIMEOUT_MS = 120_000;

export class PdfReadError extends Error {
  /** @param {string} message safe to show @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = "PdfReadError";
    this.code = code;
  }
}

/**
 * @param {any} pdfjs pdf.js module
 * @param {ArrayBuffer} buffer
 */
export async function openPdf(pdfjs, buffer) {
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      throw new PdfReadError("This PDF is password-protected. Remove the password and upload it again.", "PDF_PASSWORD");
    }
    throw new PdfReadError("Could not read this PDF. It may be damaged.", "PDF_CORRUPT");
  }
}

/**
 * @param {any} pdfjs
 * @param {any} doc from openPdf
 * @returns {Promise<{ pages: Array<{ pageNumber: number, items: Array<{ str: string, x: number, y: number, w: number, h: number }> }>, pageCount: number, truncated: boolean }>}
 */
export async function readPdfTextPages(pdfjs, doc) {
  const pageCount = doc.numPages || 0;
  const pages = [];
  for (let n = 1; n <= Math.min(pageCount, MAX_PDF_PAGES); n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items || []) {
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]) || Number(it.height) || 10;
      items.push({ str: it.str, x: tx[4], y: tx[5], w: Number(it.width) || 0, h });
    }
    pages.push({ pageNumber: n, items });
    page.cleanup?.();
  }
  return { pages, pageCount, truncated: pageCount > MAX_PDF_PAGES };
}

/**
 * OCR the first pages of a scanned PDF (browser only: needs a canvas). Words keep their positions so
 * the same table reconstruction runs on them.
 * @param {any} doc from openPdf
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [opts]
 */
export async function ocrPdfPages(doc, opts = {}) {
  const { createWorker } = await import("tesseract.js");
  const ASSET_BASE = "/vendor/tesseract";
  const total = Math.min(doc.numPages || 0, MAX_OCR_PAGES);
  let pageIdx = 0;
  const worker = await createWorker("eng", 1, {
    workerPath: `${ASSET_BASE}/worker.min.js`,
    corePath: `${ASSET_BASE}/core`,
    langPath: `${ASSET_BASE}/lang`,
    workerBlobURL: false,
    logger: (m) => {
      if (m?.status === "recognizing text" && typeof m.progress === "number") {
        opts.onProgress?.((pageIdx + m.progress) / Math.max(1, total));
      }
    },
  });
  const abort = () => worker.terminate();
  opts.signal?.addEventListener("abort", abort, { once: true });
  let timer;
  try {
    const run = async () => {
      const pages = [];
      let confidenceSum = 0;
      let words = 0;
      for (let n = 1; n <= total; n++) {
        pageIdx = n - 1;
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: OCR_SCALE });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        // "print" renders without requestAnimationFrame, which never fires in a background tab, so OCR
        // keeps going if the person switches tabs while it runs.
        await page.render({ canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise;
        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
        const items = [];
        for (const block of data?.blocks || []) {
          for (const para of block.paragraphs || []) {
            for (const line of para.lines || []) {
              // One baseline per OCR line so its words group together.
              const y = (line.bbox?.y1 ?? 0) / OCR_SCALE;
              for (const w of line.words || []) {
                if (!w?.text?.trim() || !w.bbox) continue;
                items.push({
                  str: w.text,
                  x: w.bbox.x0 / OCR_SCALE,
                  y,
                  w: (w.bbox.x1 - w.bbox.x0) / OCR_SCALE,
                  h: (w.bbox.y1 - w.bbox.y0) / OCR_SCALE,
                });
                confidenceSum += Number(w.confidence) || 0;
                words++;
              }
            }
          }
        }
        pages.push({ pageNumber: n, items });
        canvas.width = 0;
        canvas.height = 0;
      }
      return { pages, confidence: words ? confidenceSum / words : 0, pageCount: doc.numPages || 0, truncated: (doc.numPages || 0) > MAX_OCR_PAGES };
    };
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PdfReadError("Reading the scanned PDF took too long.", "OCR_TIMEOUT")), OCR_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
