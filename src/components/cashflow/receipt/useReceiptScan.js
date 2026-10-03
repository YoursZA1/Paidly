/**
 * Scan Receipt workflow state (local to the dialog — no global store churn while a receipt is read).
 *
 *   choose → [camera] → processing (uploading ‖ processing → reading → checking) → review → done
 *                                   ↘ failed (retry resumes from the failed step; manual entry keeps the upload)
 *
 * The receipt never becomes an expense here: `save` sends the reviewed form to the server, which
 * validates again and creates the expense.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { isEmptyExtraction, normalizeReceiptExtraction } from "@shared/expenses/receiptScan.js";
import {
  blobToBase64,
  inspectReceiptFile,
  preprocessReceiptImage,
  ReceiptFileError,
  sha256Hex,
} from "@/lib/receipts/receiptFile.js";
import {
  confirmReceiptExpense,
  discardReceiptUpload,
  extractReceiptOnServer,
  prepareReceiptUpload,
  ReceiptApiError,
  reviewReceipt,
  uploadReceiptOriginal,
} from "@/services/ReceiptScanService.js";

export const STEPS = ["uploading", "processing", "reading", "checking"];

function lacksMoney(extraction) {
  return extraction?.total == null && extraction?.subtotal == null;
}

/** Keep a server read, and fill only the fields it left blank from the on-device read. */
function fillReceiptGaps(primary, extra) {
  if (!extra || extra.isReceipt === false) return primary || null;
  if (!primary) return extra;
  const out = { ...primary, confidence: { ...(primary.confidence || {}) } };
  for (const key of [
    "total",
    "subtotal",
    "vatAmount",
    "vatRate",
    "transactionDate",
    "receiptNumber",
    "invoiceNumber",
    "supplierVatNumber",
    "paymentMethod",
    "currency",
    "merchantName",
    "supplierName",
  ]) {
    const blank = out[key] == null || out[key] === "";
    if (blank && extra[key] != null && extra[key] !== "") {
      out[key] = extra[key];
      if (extra.confidence?.[key] != null) out.confidence[key] = extra.confidence[key];
    }
  }
  if (!out.lineItems?.length && extra.lineItems?.length) out.lineItems = extra.lineItems;
  const normalized = normalizeReceiptExtraction(out);
  return normalized.ok ? normalized.extraction : out;
}

const initialState = {
  phase: "choose",
  steps: {},
  readProgress: 0,
  failure: null,
  receipt: null, // { kind, mime, name, sha256, previewUrl, processing, uploaded }
  receiptPath: null,
  extraction: null,
  extractionSource: "manual",
  reviewInfo: { suppliers: [], supplierMatch: null, duplicates: [], canManageSuppliers: false },
  saving: false,
  saveError: null,
  savedExpense: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "reset":
      return { ...initialState, phase: action.phase || "choose" };
    case "phase":
      return { ...state, phase: action.phase };
    case "step":
      return { ...state, steps: { ...state.steps, [action.step]: action.status } };
    case "readProgress":
      return { ...state, readProgress: action.value };
    case "receipt":
      return { ...state, receipt: { ...(state.receipt || {}), ...action.receipt } };
    case "path":
      return { ...state, receiptPath: action.path };
    case "extraction":
      return { ...state, extraction: action.extraction, extractionSource: action.source };
    case "reviewInfo":
      return { ...state, reviewInfo: { ...state.reviewInfo, ...action.info } };
    case "fail":
      return { ...state, phase: "failed", failure: action.failure };
    case "review":
      return { ...state, phase: "review", failure: null, saveError: null };
    case "saving":
      return { ...state, saving: action.value, saveError: action.value ? null : state.saveError };
    case "saveError":
      return { ...state, saving: false, saveError: action.error };
    case "saved":
      return { ...state, saving: false, phase: "done", savedExpense: action.expense };
    default:
      return state;
  }
}

function failureFrom(err, stage) {
  if (err instanceof ReceiptFileError) return { kind: "invalid_file", message: err.message, stage };
  if (err instanceof ReceiptApiError) {
    if (err.code === "UPGRADE_REQUIRED") return { kind: "upgrade", message: err.message, stage };
    if (err.code === "POS_SCOPE" || err.code === "FORBIDDEN") return { kind: "forbidden", message: err.message, stage };
    if (err.code === "UNAUTHORIZED") return { kind: "forbidden", message: err.message, stage };
    if (stage === "upload") return { kind: "upload", message: "We couldn't upload this receipt.", stage };
    return { kind: err.network ? "network" : "unreadable", message: err.message, stage };
  }
  if (stage === "upload") return { kind: "upload", message: "We couldn't upload this receipt.", stage };
  return { kind: "unreadable", message: "We couldn't read this receipt clearly.", stage };
}

/**
 * @param {{ onExpenseCreated?: (expense: any) => void }} opts
 */
export function useReceiptScan({ onExpenseCreated } = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const live = useRef({ receipt: null, receiptPath: null, saved: false, extractionAvailable: false, file: null });
  const operationId = useRef(null);
  const abortRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const safeDispatch = useCallback((action) => {
    if (mounted.current) dispatch(action);
  }, []);

  const setReceipt = useCallback(
    (receipt) => {
      live.current.receipt = { ...(live.current.receipt || {}), ...receipt };
      safeDispatch({ type: "receipt", receipt });
    },
    [safeDispatch]
  );

  // ── stages ──────────────────────────────────────────────────────────────────────────────
  const upload = useCallback(async () => {
    const r = live.current.receipt;
    if (r?.uploaded && live.current.receiptPath) return;
    safeDispatch({ type: "step", step: "uploading", status: "active" });
    const prepared = await prepareReceiptUpload(r.mime);
    live.current.extractionAvailable = Boolean(prepared.extraction_available);
    live.current.receiptPath = prepared.receipt_path;
    safeDispatch({ type: "path", path: prepared.receipt_path });
    safeDispatch({ type: "reviewInfo", info: { canManageSuppliers: Boolean(prepared.can_manage_suppliers) } });
    await uploadReceiptOriginal(prepared.receipt_path, live.current.file, r.mime);
    setReceipt({ uploaded: true });
    safeDispatch({ type: "step", step: "uploading", status: "done" });
  }, [safeDispatch, setReceipt]);

  const preprocess = useCallback(async () => {
    const r = live.current.receipt;
    if (r.kind !== "image" || r.processing) {
      safeDispatch({ type: "step", step: "processing", status: "done" });
      return;
    }
    safeDispatch({ type: "step", step: "processing", status: "active" });
    const [processed, sha256] = await Promise.all([preprocessReceiptImage(live.current.file), sha256Hex(live.current.file)]);
    const previewUrl = URL.createObjectURL(processed.preview);
    setReceipt({ processing: processed.processing, previewUrl, sha256, cropped: processed.cropped });
    safeDispatch({ type: "step", step: "processing", status: "done" });
  }, [safeDispatch, setReceipt]);

  /** Server provider when configured, otherwise on-device OCR (images only). */
  const read = useCallback(async () => {
    const r = live.current.receipt;
    safeDispatch({ type: "step", step: "reading", status: "active" });
    safeDispatch({ type: "readProgress", value: 0 });
    let extraction = null;
    let source = "manual";
    let serverSaidNotReceipt = false;

    if (live.current.extractionAvailable) {
      try {
        const image = r.kind === "image" && r.processing ? { data: await blobToBase64(r.processing), media_type: "image/jpeg" } : null;
        const res = await extractReceiptOnServer(live.current.receiptPath, image, { signal: abortRef.current?.signal });
        if (res.ok && res.extraction) {
          extraction = res.extraction;
          source = "server";
        } else if (res.code === "NOT_A_RECEIPT") {
          serverSaidNotReceipt = true;
        }
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        // Server reading unavailable right now — fall through to on-device OCR.
      }
    }

    if (!serverSaidNotReceipt && r.kind === "image" && r.processing && lacksMoney(extraction)) {
      const serverRead = extraction;
      try {
        const { readReceiptOnDevice } = await import("@/lib/receipts/onDeviceOcr.js");
        const device = await readReceiptOnDevice(r.processing, {
          signal: abortRef.current?.signal,
          onProgress: (p) => safeDispatch({ type: "readProgress", value: p }),
        });
        if (!serverRead) {
          extraction = device;
          source = "on_device";
        } else {
          extraction = fillReceiptGaps(serverRead, device);
          source = "server";
        }
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        extraction = serverRead;
      }
    }

    if (serverSaidNotReceipt || extraction?.isReceipt === false) {
      safeDispatch({ type: "step", step: "reading", status: "error" });
      const e = new Error("not a receipt");
      e.kind = "not_receipt";
      throw e;
    }
    if (!extraction || isEmptyExtraction(extraction)) {
      safeDispatch({ type: "step", step: "reading", status: "error" });
      const e = new Error("unreadable");
      e.kind = "unreadable";
      throw e;
    }
    safeDispatch({ type: "extraction", extraction, source });
    safeDispatch({ type: "step", step: "reading", status: "done" });
    return extraction;
  }, [safeDispatch]);

  const check = useCallback(
    async (extraction) => {
      safeDispatch({ type: "step", step: "checking", status: "active" });
      try {
        const res = await reviewReceipt({
          receipt_path: live.current.receiptPath,
          sha256: live.current.receipt?.sha256 || null,
          vendor: extraction?.merchantName || extraction?.supplierName || "",
          vat_number: extraction?.supplierVatNumber || "",
          receipt_number: extraction?.receiptNumber || extraction?.invoiceNumber || "",
          total: extraction?.total ?? null,
          date: extraction?.transactionDate || null,
        });
        safeDispatch({
          type: "reviewInfo",
          info: {
            suppliers: res.suppliers || [],
            supplierMatch: res.supplier_match || null,
            duplicates: res.duplicates || [],
            canManageSuppliers: Boolean(res.can_manage_suppliers),
          },
        });
      } catch {
        // Supplier suggestions and the early duplicate warning are conveniences; Save re-checks on the server.
      }
      safeDispatch({ type: "step", step: "checking", status: "done" });
    },
    [safeDispatch]
  );

  const runFrom = useCallback(
    async (stage) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      safeDispatch({ type: "phase", phase: "processing" });
      let current = stage;
      try {
        if (stage === "upload") {
          current = "upload";
          // Upload the original while the processing copy is prepared.
          const [up, pre] = await Promise.allSettled([upload(), preprocess()]);
          if (pre.status === "rejected") {
            current = "preprocess";
            throw pre.reason;
          }
          if (up.status === "rejected") {
            safeDispatch({ type: "step", step: "uploading", status: "error" });
            throw up.reason;
          }
        }
        current = "read";
        const extraction = await read();
        current = "check";
        await check(extraction);
        safeDispatch({ type: "review" });
      } catch (err) {
        if (err?.name === "AbortError" || !mounted.current) return;
        if (err?.kind === "not_receipt") {
          safeDispatch({ type: "fail", failure: { kind: "not_receipt", message: "This image doesn't appear to contain a readable receipt.", stage: current } });
        } else if (err?.kind === "unreadable") {
          const pdf = live.current.receipt?.kind === "pdf";
          safeDispatch({
            type: "fail",
            failure: {
              kind: "unreadable",
              fileKind: pdf ? "pdf" : "image",
              message: pdf ? "We couldn't read this PDF." : "We couldn't read this receipt clearly.",
              stage: current,
            },
          });
        } else {
          safeDispatch({ type: "fail", failure: failureFrom(err, current) });
        }
      }
    },
    [check, preprocess, read, safeDispatch, upload]
  );

  // ── actions ─────────────────────────────────────────────────────────────────────────────
  const discardCurrent = useCallback(() => {
    const path = live.current.receiptPath;
    if (path && !live.current.saved) void discardReceiptUpload(path);
    if (live.current.receipt?.previewUrl) URL.revokeObjectURL(live.current.receipt.previewUrl);
    live.current = { receipt: null, receiptPath: null, saved: false, extractionAvailable: false, file: null };
    operationId.current = null;
  }, []);

  const start = useCallback(
    async (file, { source = "upload" } = {}) => {
      abortRef.current?.abort();
      discardCurrent();
      safeDispatch({ type: "reset", phase: "processing" });
      let info;
      try {
        info = await inspectReceiptFile(file);
      } catch (err) {
        safeDispatch({ type: "fail", failure: failureFrom(err, "inspect") });
        return;
      }
      live.current.file = file;
      operationId.current = crypto.randomUUID();
      setReceipt({ kind: info.kind, mime: info.mime, name: file.name || "receipt", captured: source === "camera" });
      if (info.kind === "pdf") setReceipt({ sha256: await sha256Hex(file), previewUrl: URL.createObjectURL(file) });
      await runFrom("upload");
    },
    [discardCurrent, runFrom, safeDispatch, setReceipt]
  );

  const retry = useCallback(() => {
    const stage = state.failure?.stage;
    if (!live.current.file || stage === "inspect" || stage === "preprocess") {
      safeDispatch({ type: "reset" });
      return;
    }
    void runFrom(live.current.receipt?.uploaded ? (stage === "check" ? "check" : "read") : "upload");
  }, [runFrom, safeDispatch, state.failure]);

  /** Keep the uploaded receipt and type the details. */
  const enterManually = useCallback(async () => {
    if (!live.current.receiptPath || !live.current.receipt?.uploaded) return;
    safeDispatch({ type: "extraction", extraction: null, source: "manual" });
    safeDispatch({ type: "review" });
    await check(null);
  }, [check, safeDispatch]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    discardCurrent();
    safeDispatch({ type: "reset" });
  }, [discardCurrent, safeDispatch]);

  /** "Scan another" after a save keeps the saved receipt. */
  const scanAnother = useCallback(() => {
    if (live.current.receipt?.previewUrl) URL.revokeObjectURL(live.current.receipt.previewUrl);
    live.current = { receipt: null, receiptPath: null, saved: false, extractionAvailable: false, file: null };
    operationId.current = null;
    safeDispatch({ type: "reset" });
  }, [safeDispatch]);

  const openCamera = useCallback(() => safeDispatch({ type: "phase", phase: "camera" }), [safeDispatch]);
  const closeCamera = useCallback(() => safeDispatch({ type: "phase", phase: "choose" }), [safeDispatch]);

  /**
   * @param {Record<string, unknown>} fields reviewed form values
   * @param {{ duplicateAcknowledged?: boolean, vatAcknowledged?: boolean, editedFields?: string[] }} flags
   */
  const save = useCallback(
    async (fields, flags = {}) => {
      if (state.saving) return;
      safeDispatch({ type: "saving", value: true });
      try {
        const res = await confirmReceiptExpense({
          ...fields,
          client_operation_id: operationId.current,
          receipt_path: live.current.receiptPath,
          sha256: live.current.receipt?.sha256 || null,
          duplicate_acknowledged: Boolean(flags.duplicateAcknowledged),
          vat_acknowledged: Boolean(flags.vatAcknowledged),
          edited_fields: flags.editedFields || [],
          extraction_source: state.extractionSource,
        });
        live.current.saved = true;
        safeDispatch({ type: "saved", expense: res.expense });
        onExpenseCreated?.(res.expense);
      } catch (err) {
        if (err instanceof ReceiptApiError && err.code === "POSSIBLE_DUPLICATE") {
          safeDispatch({ type: "reviewInfo", info: { duplicates: err.duplicates || [] } });
        }
        safeDispatch({
          type: "saveError",
          error: {
            code: err?.code || "ERROR",
            message: err instanceof ReceiptApiError ? err.message : "We couldn't save this expense. Please try again.",
            errors: err?.errors || {},
            network: Boolean(err?.network),
          },
        });
      }
    },
    [onExpenseCreated, safeDispatch, state.extractionSource, state.saving]
  );

  return {
    state,
    start,
    retry,
    enterManually,
    reset,
    scanAnother,
    openCamera,
    closeCamera,
    save,
    /** Close without saving: remove the pending upload. */
    abandon: reset,
  };
}
