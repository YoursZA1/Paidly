/**
 * Product Import — which document is this, and is it safe to try reading?
 * Extension, MIME type and the file's own leading bytes must agree; the bytes win.
 */
import { IMPORT_LIMITS } from "@shared/catalog/productImport.js";

export const IMPORT_ACCEPT = ".xlsx,.xls,.csv,.pdf";

const EXT_KIND = Object.freeze({ xlsx: "xlsx", xls: "xls", csv: "csv", pdf: "pdf" });

const MIME_KINDS = Object.freeze({
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-excel": ["xls", "csv"], // Windows reports .csv as vnd.ms-excel
  "application/pdf": ["pdf"],
  "text/csv": ["csv"],
  "text/plain": ["csv"],
  "application/csv": ["csv"],
  "text/comma-separated-values": ["csv"],
  "application/octet-stream": ["xlsx", "xls", "csv", "pdf"],
  "": ["xlsx", "xls", "csv", "pdf"],
});

export const KIND_LABEL = Object.freeze({ xlsx: "Excel", xls: "Excel", csv: "CSV", pdf: "PDF" });

export class ImportFileError extends Error {
  /** @param {string} message plain sentence safe to show @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = "ImportFileError";
    this.code = code;
  }
}

/** @param {Uint8Array} b */
export function sniffKind(b) {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)) return "zip";
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) return "ole";
  // Text: no NUL bytes in the first 4 KB (UTF-16 CSVs start with a BOM and are allowed).
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return "text16";
  for (let i = 0; i < Math.min(b.length, 4096); i++) if (b[i] === 0) return "binary";
  return "text";
}

/**
 * @param {File} file
 * @returns {Promise<{ kind: "xlsx" | "xls" | "csv" | "pdf", buffer: ArrayBuffer }>}
 */
export async function inspectImportFile(file) {
  if (!file || typeof file.size !== "number") throw new ImportFileError("Choose a file to import.", "NO_FILE");
  const name = String(file.name || "");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const kind = EXT_KIND[ext];
  if (!kind) throw new ImportFileError("Upload an Excel (.xlsx, .xls), CSV or PDF file.", "UNSUPPORTED");
  if (file.size === 0) throw new ImportFileError("This file is empty.", "EMPTY");
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    throw new ImportFileError(`This file is too large. The maximum is ${Math.round(IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB.`, "TOO_LARGE");
  }
  const mime = String(file.type || "").toLowerCase();
  const allowed = MIME_KINDS[mime];
  if (allowed && !allowed.includes(kind)) {
    throw new ImportFileError("The file type doesn't match its name. Upload an Excel, CSV or PDF file.", "MIME_MISMATCH");
  }
  if (!allowed && !mime.startsWith("text/")) {
    throw new ImportFileError("Upload an Excel (.xlsx, .xls), CSV or PDF file.", "UNSUPPORTED");
  }

  const buffer = await file.arrayBuffer();
  const sniffed = sniffKind(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4096)));
  const ok =
    (kind === "pdf" && sniffed === "pdf") ||
    (kind === "xlsx" && sniffed === "zip") ||
    (kind === "xls" && sniffed === "ole") ||
    (kind === "csv" && (sniffed === "text" || sniffed === "text16"));
  if (!ok) {
    const label = KIND_LABEL[kind];
    throw new ImportFileError(`This doesn't look like a real ${label} file — it may be damaged or renamed.`, "CORRUPT");
  }
  return { kind, buffer };
}

/** "1.2 MB" / "840 KB". */
export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
