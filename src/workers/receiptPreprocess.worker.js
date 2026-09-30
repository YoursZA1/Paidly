/**
 * Web Worker: receipt image preprocessing off the main thread (OffscreenCanvas).
 * Input { file: Blob } → { ok: true, result } | { ok: false, code: "corrupt" | "unsupported" }.
 */
import { processReceiptImage } from "../lib/receipts/receiptImageProcessing.js";

const env = {
  createCanvas: (w, h) => new OffscreenCanvas(w, h),
  toBlob: (canvas, type, quality) => canvas.convertToBlob({ type, quality }),
};

self.onmessage = async (event) => {
  const { file } = event.data || {};
  if (typeof OffscreenCanvas === "undefined") {
    self.postMessage({ ok: false, code: "unsupported" });
    return;
  }
  try {
    const result = await processReceiptImage(file, env);
    self.postMessage({ ok: true, result });
  } catch (err) {
    // Decode failures mean a damaged file; anything else (canvas limits) → retry on the main thread.
    self.postMessage({ ok: false, code: err?.name === "ReceiptDecodeError" ? "corrupt" : "unsupported" });
  }
};
