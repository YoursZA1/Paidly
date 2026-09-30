/**
 * Product Import — read an uploaded document into tables for mapping. Browser only.
 *
 *   Excel / CSV → parsed in a Web Worker (src/workers/productImportSheet.worker.js)
 *   PDF         → pdf.js text layer → table reconstruction (pdfTable.js)
 *   scanned PDF → `scanned: true`; the caller can offer on-device OCR (readScannedPdf)
 */
import { ImportFileError, inspectImportFile, KIND_LABEL } from "@/lib/productImport/fileDetect.js";
import { parseCsvBuffer, parseWorkbookBuffer, pickBestSheet } from "@/lib/productImport/tableParsing.js";
import { extractPdfProductTable, looksScanned } from "@/lib/productImport/pdfTable.js";
import { MAX_OCR_PAGES, MAX_PDF_PAGES, ocrPdfPages, openPdf, readPdfTextPages } from "@/lib/productImport/pdfReader.js";

const SHEET_TIMEOUT_MS = 45_000;

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function parseInWorker(kind, buffer) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("../../workers/productImportSheet.worker.js", import.meta.url), { type: "module" });
    } catch {
      reject(Object.assign(new Error("worker unavailable"), { code: "NO_WORKER" }));
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" }));
    }, SHEET_TIMEOUT_MS);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      const msg = event.data || {};
      if (msg.ok) resolve(msg.result);
      else reject(Object.assign(new Error(msg.code || "failed"), { code: msg.code || "UNREADABLE" }));
    };
    worker.onerror = (e) => {
      e?.preventDefault?.();
      clearTimeout(timer);
      worker.terminate();
      reject(Object.assign(new Error("worker error"), { code: "NO_WORKER" }));
    };
    worker.postMessage({ kind, buffer }, [buffer]);
  });
}

async function parseSheets(kind, buffer) {
  try {
    return await parseInWorker(kind, buffer.slice(0));
  } catch (err) {
    if (err?.code !== "NO_WORKER") throw err;
    // Very old browsers without module workers: same parser on the main thread.
    if (kind === "csv") return parseCsvBuffer(buffer);
    return parseWorkbookBuffer(await import("xlsx"), buffer);
  }
}

/**
 * @typedef {{
 *   kind: "xlsx" | "xls" | "csv" | "pdf",
 *   sheets: Array<{ name: string, table: import("./tableParsing.js").ImportTable & { rowMeta?: any[], uncertain?: boolean } }>,
 *   activeSheet: number,
 *   notices: string[],
 *   scanned?: boolean,
 *   pdfBuffer?: ArrayBuffer,
 * }} ReadResult
 */

/**
 * @param {File} file
 * @param {{ onStage?: (label: string) => void }} [opts]
 * @returns {Promise<ReadResult>}
 */
export async function readProductDocument(file, opts = {}) {
  const stage = opts.onStage || (() => {});
  stage("Reading document…");
  const { kind, buffer } = await inspectImportFile(file);
  const notices = [];

  if (kind !== "pdf") {
    stage("Detecting columns…");
    let parsed;
    try {
      parsed = await parseSheets(kind, buffer);
    } catch (err) {
      if (err?.code === "TIMEOUT") throw new ImportFileError("This file took too long to read. Try saving it as CSV and uploading again.", "TIMEOUT");
      throw new ImportFileError(`Could not read this ${KIND_LABEL[kind]} file.`, "UNREADABLE");
    }
    const sheets = parsed?.sheets || [];
    if (!sheets.length) throw new ImportFileError("This file doesn't contain any product rows.", "NO_ROWS");
    if (sheets.some((s) => s.table.truncated)) notices.push("Only the first 5,000 rows were read. Split larger files into several imports.");
    return { kind, sheets, activeSheet: pickBestSheet(sheets), notices };
  }

  stage("Extracting text from PDF…");
  const pdfjs = await loadPdfjs();
  const doc = await openPdf(pdfjs, buffer);
  try {
    const { pages, pageCount, truncated } = await readPdfTextPages(pdfjs, doc);
    if (truncated) notices.push(`Only the first ${MAX_PDF_PAGES} pages were read.`);
    const { table, textChars } = extractPdfProductTable(pages);
    if (looksScanned(textChars, pageCount)) {
      return { kind, sheets: [], activeSheet: -1, notices, scanned: true, pdfBuffer: buffer };
    }
    stage("Extracting products…");
    if (!table || !table.rows.length) {
      throw new ImportFileError("This PDF does not contain readable product data.", "NO_TABLE");
    }
    if (table.uncertain) notices.push("No column headings were found in this PDF, so Paidly guessed the columns. Check the mapping and every row.");
    if (table.tableCount > 1) notices.push(`${table.tableCount} tables were found in this PDF and combined.`);
    return { kind, sheets: [{ name: "PDF", table }], activeSheet: 0, notices };
  } finally {
    doc.destroy?.();
  }
}

/**
 * On-device OCR for a scanned PDF. Every row it produces is flagged for review.
 * @param {ArrayBuffer} buffer
 * @param {{ onProgress?: (fraction: number) => void, signal?: AbortSignal }} [opts]
 * @returns {Promise<ReadResult>}
 */
export async function readScannedPdf(buffer, opts = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await openPdf(pdfjs, buffer);
  try {
    const { pages, truncated, confidence } = await ocrPdfPages(doc, opts);
    const { table } = extractPdfProductTable(pages);
    if (!table || !table.rows.length) {
      throw new ImportFileError(
        "This PDF appears to be scanned/image-based. Text could not be reliably extracted. Please upload an Excel/CSV file or a text-based PDF.",
        "SCANNED"
      );
    }
    const rowMeta = table.rowMeta.map((m) => ({ ...m, ocr: true }));
    const notices = ["This PDF was read with OCR (text recognition). Check every value before importing."];
    if (truncated) notices.push(`Only the first ${MAX_OCR_PAGES} pages were read with OCR.`);
    if (confidence && confidence < 70) notices.push("The scan is hard to read — expect mistakes in names and numbers.");
    return { kind: "pdf", sheets: [{ name: "PDF (OCR)", table: { ...table, rowMeta, uncertain: true } }], activeSheet: 0, notices };
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw new ImportFileError(
      "This PDF appears to be scanned/image-based. Text could not be reliably extracted. Please upload an Excel/CSV file or a text-based PDF.",
      "SCANNED"
    );
  } finally {
    doc.destroy?.();
  }
}
