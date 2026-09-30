/**
 * Receipt image preprocessing — pure pixel maths plus a canvas pipeline that runs in a Web Worker
 * (OffscreenCanvas) or, on browsers without it, on the main thread.
 *
 * The original upload is never touched: this produces a separate, smaller "processing copy" for
 * reading the receipt and a preview for the review screen.
 */

/** Longest edge of the processing copy. Keeps OCR/vision fast without losing small print. */
export const PROCESSING_MAX_EDGE = 1600;

/** @param {number} r @param {number} g @param {number} b */
function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** @param {Uint32Array} hist @param {number} total @param {number} q */
function percentile(hist, total, q) {
  const target = total * q;
  let acc = 0;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

/**
 * Receipt paper is the bright region; crop away darker background (table, hand) around it.
 * Conservative: returns null unless a clear bright block covering 20–90% of the frame stands out,
 * so a receipt on a white desk (or a scan) is left alone.
 *
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img small RGBA thumbnail
 * @returns {{ x: number, y: number, width: number, height: number } | null} in thumbnail pixels
 */
export function findReceiptBounds(img) {
  const { data, width, height } = img;
  if (!width || !height) return null;
  const hist = new Uint32Array(256);
  const lum = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < lum.length; i += 4, p += 1) {
    const l = luma(data[i], data[i + 1], data[i + 2]) | 0;
    lum[p] = l;
    hist[l] += 1;
  }
  const total = width * height;
  const p10 = percentile(hist, total, 0.1);
  const p90 = percentile(hist, total, 0.9);
  // Not enough contrast between paper and background to tell them apart.
  if (p90 - p10 < 60) return null;
  const threshold = Math.max(120, Math.round((p10 + p90) / 2));

  const rowBright = new Float32Array(height);
  const colBright = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (lum[y * width + x] >= threshold) {
        rowBright[y] += 1;
        colBright[x] += 1;
      }
    }
  }
  const firstAbove = (arr, len, min) => {
    for (let i = 0; i < arr.length; i += 1) if (arr[i] / len >= min) return i;
    return -1;
  };
  const lastAbove = (arr, len, min) => {
    for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] / len >= min) return i;
    return -1;
  };
  const top = firstAbove(rowBright, width, 0.15);
  const bottom = lastAbove(rowBright, width, 0.15);
  const left = firstAbove(colBright, height, 0.15);
  const right = lastAbove(colBright, height, 0.15);
  if (top < 0 || left < 0 || bottom <= top || right <= left) return null;

  const marginX = Math.round(width * 0.03);
  const marginY = Math.round(height * 0.03);
  const x = Math.max(0, left - marginX);
  const y = Math.max(0, top - marginY);
  const w = Math.min(width, right + marginX + 1) - x;
  const h = Math.min(height, bottom + marginY + 1) - y;
  const area = (w * h) / total;
  if (area < 0.2 || area > 0.9 || w < width * 0.25 || h < height * 0.25) return null;
  return { x, y, width: w, height: h };
}

/**
 * Grayscale + contrast stretch (2nd–98th percentile) in place — only when the photo is flat enough
 * to benefit. Returns true when it changed the pixels.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img
 */
export function enhanceForReading(img) {
  const { data } = img;
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const l = luma(data[i], data[i + 1], data[i + 2]) | 0;
    data[i] = data[i + 1] = data[i + 2] = l;
    hist[l] += 1;
  }
  const total = data.length / 4;
  const lo = percentile(hist, total, 0.02);
  const hi = percentile(hist, total, 0.98);
  const range = hi - lo;
  if (range <= 0 || range >= 220) return false;
  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, (data[i] - lo) * scale));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  return true;
}

/** @param {number} w @param {number} h @param {number} maxEdge */
export function fitWithin(w, h, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Decode → orient → crop → resize → (preview, processing copy).
 * @param {Blob} file original upload (never modified)
 * @param {{ createCanvas: (w: number, h: number) => any, toBlob: (canvas: any, type: string, quality: number) => Promise<Blob> }} env
 * @returns {Promise<{ width: number, height: number, cropped: boolean, enhanced: boolean, preview: Blob, processing: Blob }>}
 */
export async function processReceiptImage(file, env) {
  // Orientation: browsers apply EXIF rotation on decode ("from-image").
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Object.assign(new Error("Image could not be decoded"), { name: "ReceiptDecodeError" });
  }
  try {
    const { width: srcW, height: srcH } = bitmap;

    // Find the receipt on a small thumbnail (fast), then map back.
    const thumb = fitWithin(srcW, srcH, 240);
    const tCanvas = env.createCanvas(thumb.width, thumb.height);
    const tCtx = tCanvas.getContext("2d", { willReadFrequently: true });
    tCtx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
    const bounds = findReceiptBounds(tCtx.getImageData(0, 0, thumb.width, thumb.height));
    const sx = bounds ? Math.round((bounds.x / thumb.width) * srcW) : 0;
    const sy = bounds ? Math.round((bounds.y / thumb.height) * srcH) : 0;
    const sw = bounds ? Math.round((bounds.width / thumb.width) * srcW) : srcW;
    const sh = bounds ? Math.round((bounds.height / thumb.height) * srcH) : srcH;

    const out = fitWithin(sw, sh, PROCESSING_MAX_EDGE);
    const canvas = env.createCanvas(out.width, out.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const preview = await env.toBlob(canvas, "image/jpeg", 0.85);

    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    const enhanced = enhanceForReading(pixels);
    ctx.putImageData(pixels, 0, 0);
    const processing = await env.toBlob(canvas, "image/jpeg", 0.9);

    return { width: srcW, height: srcH, cropped: Boolean(bounds), enhanced, preview, processing };
  } finally {
    bitmap.close?.();
  }
}
