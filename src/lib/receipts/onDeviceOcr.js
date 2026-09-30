/**
 * On-device receipt OCR (tesseract.js, which runs in its own Web Worker — the page stays responsive).
 * Assets are self-hosted under /vendor/tesseract (scripts/copy-ocr-assets.mjs) because the CSP blocks CDNs.
 */
import { parseReceiptOcrText } from "@/lib/receipts/ocrTextParser.js";

const ASSET_BASE = "/vendor/tesseract";
const OCR_TIMEOUT_MS = 90_000;

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
    const recognized = await Promise.race([
      worker.recognize(image),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("On-device OCR timed out")), OCR_TIMEOUT_MS);
      }),
    ]);
    const data = recognized?.data || {};
    return parseReceiptOcrText(data.text || "", { confidence: data.confidence });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
