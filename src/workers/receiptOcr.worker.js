/**
 * Web Worker: runs Tesseract OCR off the main thread.
 * Receives image as ArrayBuffer, returns structured receipt data.
 */

import { createWorker } from "tesseract.js";
import { extractReceiptDataFromText } from "../utils/receiptTesseractOcr.js";

self.onmessage = async (e) => {
  const { arrayBuffer, mimeType } = e.data || {};
  if (!arrayBuffer) {
    self.postMessage({ error: "Missing arrayBuffer" });
    return;
  }

  try {
    const blob = new Blob([arrayBuffer], { type: mimeType || "image/png" });
    const worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status) self.postMessage({ progress: m });
      },
    });
    try {
      const { data } = await worker.recognize(blob);
      const text = data?.text || "";
      const result = extractReceiptDataFromText(text);
      self.postMessage({ result });
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    self.postMessage({
      error: err?.message || String(err),
    });
  }
};
