/**
 * Receipt file checks before anything is uploaded or read: type (by content, not just the name),
 * size, damage and dimensions. Unsupported files never reach upload or OCR.
 */
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_DIMENSION,
  RECEIPT_MIN_DIMENSION,
} from "@shared/expenses/receiptScan.js";
import { processReceiptImage } from "@/lib/receipts/receiptImageProcessing.js";

export class ReceiptFileError extends Error {
  /** @param {"empty" | "too_large" | "unsupported" | "heic" | "corrupt" | "too_small" | "too_big_dimensions"} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "ReceiptFileError";
    this.code = code;
  }
}

/** Magic bytes → MIME. @param {Uint8Array} b */
export function sniffReceiptMime(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  return null;
}

function isHeic(file, head) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  const brand = head.length >= 12 ? String.fromCharCode(...head.slice(4, 12)) : "";
  return /heic|heif/.test(type) || /\.(heic|heif)$/.test(name) || /ftyp(heic|heix|mif1|msf1)/.test(brand);
}

/**
 * @param {File | Blob} file
 * @returns {Promise<{ kind: "image" | "pdf", mime: string }>}
 */
export async function inspectReceiptFile(file) {
  if (!file || typeof file.size !== "number" || file.size === 0) {
    throw new ReceiptFileError("empty", "This file is empty. Choose another receipt.");
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    throw new ReceiptFileError("too_large", "This file is larger than 10 MB. Take a new photo or choose a smaller file.");
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = sniffReceiptMime(head);
  if (!mime) {
    if (isHeic(file, head)) {
      throw new ReceiptFileError(
        "heic",
        "This photo is in HEIC format. Use Scan Receipt to take the photo in Paidly, or save it as JPG first."
      );
    }
    throw new ReceiptFileError("unsupported", "Use a JPG, PNG, WEBP or PDF receipt.");
  }
  if (mime === "application/pdf") {
    const tail = new TextDecoder("latin1").decode(await file.slice(Math.max(0, file.size - 1024)).arrayBuffer());
    if (!tail.includes("%%EOF")) {
      throw new ReceiptFileError("corrupt", "We couldn't open this PDF. It may be damaged — try another file.");
    }
    return { kind: "pdf", mime };
  }
  return { kind: "image", mime };
}

/** @param {{ width: number, height: number }} dims */
export function assertReceiptDimensions({ width, height }) {
  if (Math.min(width, height) < RECEIPT_MIN_DIMENSION) {
    throw new ReceiptFileError("too_small", "This image is too small to read. Take a closer photo of the receipt.");
  }
  if (Math.max(width, height) > RECEIPT_MAX_DIMENSION) {
    throw new ReceiptFileError("too_big_dimensions", "This image is too large to process. Take a new photo instead.");
  }
}

/** SHA-256 of the original file (duplicate detection). @param {Blob} file */
export async function sha256Hex(file) {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

const WORKER_TIMEOUT_MS = 20_000;

function runPreprocessWorker(file) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("../../workers/receiptPreprocess.worker.js", import.meta.url), { type: "module" });
    } catch {
      reject(Object.assign(new Error("worker unavailable"), { code: "unsupported" }));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Object.assign(new Error("timeout"), { code: "unsupported" }));
    }, WORKER_TIMEOUT_MS);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      const msg = event.data || {};
      if (msg.ok) resolve(msg.result);
      else reject(Object.assign(new Error(msg.code || "failed"), { code: msg.code || "unsupported" }));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(Object.assign(new Error("worker error"), { code: "unsupported" }));
    };
    worker.postMessage({ file });
  });
}

const mainThreadEnv = {
  createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
  toBlob: (canvas, type, quality) =>
    new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality)),
};

/**
 * Orient, crop, resize and enhance a copy of the receipt photo (off the main thread where supported).
 * @param {Blob} file
 * @returns {Promise<{ width: number, height: number, cropped: boolean, enhanced: boolean, preview: Blob, processing: Blob }>}
 */
export async function preprocessReceiptImage(file) {
  let result;
  try {
    result = await runPreprocessWorker(file);
  } catch (err) {
    if (err?.code === "corrupt") {
      throw new ReceiptFileError("corrupt", "We couldn't open this image. It may be damaged — try another photo.");
    }
    try {
      result = await processReceiptImage(file, mainThreadEnv);
    } catch {
      throw new ReceiptFileError("corrupt", "We couldn't open this image. It may be damaged — try another photo.");
    }
  }
  assertReceiptDimensions(result);
  return result;
}

/** @param {Blob} blob @returns {Promise<string>} base64 without the data: prefix */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
