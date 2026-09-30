/**
 * Product Import — parse an uploaded Excel / CSV file off the main thread.
 *
 * Running SheetJS here keeps a hostile or huge workbook away from the page: the UI stays responsive,
 * a parse that never finishes is simply terminated, and anything the parser does to its own globals
 * cannot touch the app. Input { kind, buffer }; output { ok, result } | { ok: false, code }.
 */
import * as XLSX from "xlsx";
import { parseCsvBuffer, parseWorkbookBuffer } from "../lib/productImport/tableParsing.js";

self.onmessage = (event) => {
  const { kind, buffer } = event.data || {};
  try {
    if (kind === "csv") {
      self.postMessage({ ok: true, result: parseCsvBuffer(buffer) });
      return;
    }
    self.postMessage({ ok: true, result: parseWorkbookBuffer(XLSX, buffer) });
  } catch {
    self.postMessage({ ok: false, code: "UNREADABLE" });
  }
};
