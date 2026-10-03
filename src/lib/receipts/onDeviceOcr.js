/**
 * On-device receipt OCR (tesseract.js, which runs in its own Web Worker — the page stays responsive).
 * Assets are self-hosted under /vendor/tesseract (scripts/copy-ocr-assets.mjs) because the CSP blocks CDNs.
 */
import { mergeOcrPasses, parseReceiptOcrText } from "@/lib/receipts/ocrTextParser.js";

const ASSET_BASE = "/vendor/tesseract";
const OCR_TIMEOUT_MS = 90_000;

/** Right-hand price column of a till slip, as its own image for a second OCR pass. */
async function rightColumnBlob(image) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return null;
  }
  try {
    const x = Math.round(bitmap.width * 0.5);
    const width = bitmap.width - x;
    if (width < 40) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, bitmap.height);
    ctx.drawImage(bitmap, x, 0, width, bitmap.height, 0, 0, width, bitmap.height);
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  } finally {
    bitmap.close?.();
  }
}

/**
 * @param {Blob} image processing copy (JPEG/PNG)
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<import("@shared/expenses/receiptScan.js").ReceiptExtraction>}
 */
export async function readReceiptOnDevice(image, opts = {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${ASSET_BASE}/worker.min.js`,
    corePath: `${ASSET_BASE}/core`,
    langPath: `${ASSET_BASE}/lang`,
    workerBlobURL: false,
    logger: (m) => {
      if (m?.status === "recognizing text" && typeof m.progress === "number") opts.onProgress?.(m.progress);
    },
  });
  let timer;
  const abort = () => worker.terminate();
  opts.signal?.addEventListener("abort", abort, { once: true });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "6" }).catch(() => {});
    const recognized = await Promise.race([
      worker.recognize(image),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("On-device OCR timed out")), OCR_TIMEOUT_MS);
      }),
    ]);
    const data = recognized?.data || {};
    let text = data.text || "";
    let parsed = parseReceiptOcrText(text, { confidence: data.confidence });
    // Prices sit in a right-hand column. When the first pass read the words but not the amounts,
    // read that column and attach the prices before giving up.
    if (parsed.total == null && parsed.subtotal == null) {
      const column = await rightColumnBlob(image);
      if (column) {
        const side = await worker.recognize(column);
        const sideText = side?.data?.text || "";
        if (sideText.trim()) {
          text = mergeOcrPasses(text, sideText);
          parsed = parseReceiptOcrText(text, {
            confidence: Math.max(Number(data.confidence) || 0, Number(side?.data?.confidence) || 0),
          });
        }
      }
    }
    return parsed;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
