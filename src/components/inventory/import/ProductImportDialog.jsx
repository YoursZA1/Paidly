import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Loader2, RotateCcw, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import DoneState from "@/components/shared/DoneState";
import ImportStepper from "@/components/inventory/import/ImportStepper";
import ImportUploadStep from "@/components/inventory/import/ImportUploadStep";
import ImportMapStep from "@/components/inventory/import/ImportMapStep";
import ImportReviewStep from "@/components/inventory/import/ImportReviewStep";
import { readProductDocument, readScannedPdf } from "@/lib/productImport/readProductDocument.js";
import { createReviewRows, evaluateReviewRows, notImportedRows, summarizeReview, toCommitRows } from "@/lib/productImport/reviewModel.js";
import { downloadErrorReport } from "@/lib/productImport/importFiles.js";
import { checkImportDuplicates, commitProductImport, ProductImportApiError } from "@/services/ProductImportService.js";
import { IGNORE_COLUMN, ROW_STATUS, headerSignature, suggestColumnMapping, validateImportRow } from "@shared/catalog/productImport.js";

const MAPPING_STORE = "paidly.productImport.mappings";

function rememberedMapping(itemType, headers) {
  try {
    const all = JSON.parse(sessionStorage.getItem(MAPPING_STORE) || "{}");
    const saved = all[`${itemType}:${headerSignature(headers)}`];
    return Array.isArray(saved) && saved.length === headers.length ? saved : null;
  } catch {
    return null;
  }
}

function rememberMapping(itemType, headers, mapping) {
  try {
    const all = JSON.parse(sessionStorage.getItem(MAPPING_STORE) || "{}");
    all[`${itemType}:${headerSignature(headers)}`] = mapping;
    sessionStorage.setItem(MAPPING_STORE, JSON.stringify(all));
  } catch {
    /* private mode / storage blocked — mapping just isn't remembered */
  }
}

function newImportId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

const initialState = () => ({
  step: "upload",
  file: null,
  doc: null,
  sheetIdx: 0,
  mapping: [],
  confidence: [],
  notes: [],
  rows: [],
  existing: [],
  results: null,
  importId: newImportId(),
});

/**
 * Product Import — Upload → Map → Review → Import. Nothing is written until the person confirms the
 * summary; the server re-validates and does every write.
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, canImportProducts: boolean,
 *           onUpgrade: () => void, onImported?: () => void, standardVatRate?: number }} props
 */
export default function ProductImportDialog({ open, onOpenChange, canImportProducts, onUpgrade, onImported, standardVatRate }) {
  const [itemType, setItemType] = useState(canImportProducts ? "product" : "service");
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const abortRef = useRef(null);
  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setState(initialState());
      setBusy(null);
      setError("");
      setReviewFilter("all");
    }
  }, [open]);
  useEffect(() => {
    if (!canImportProducts) setItemType("service");
  }, [canImportProducts]);

  const sheet = state.doc?.sheets?.[state.sheetIdx] || null;
  const evaluated = useMemo(
    () => evaluateReviewRows(state.rows, { itemType, existing: state.existing, standardRate: standardVatRate }),
    [itemType, standardVatRate, state.existing, state.rows]
  );
  const summary = useMemo(() => summarizeReview(evaluated), [evaluated]);

  const applyMapping = useCallback(
    (doc, sheetIdx, type) => {
      const table = doc.sheets[sheetIdx].table;
      const suggested = suggestColumnMapping(table.headers, { itemType: type });
      const saved = rememberedMapping(type, table.headers);
      // PDFs without headings: every guessed column needs a look.
      const confidence = table.uncertain ? suggested.confidence.map((c) => (c === "high" ? "medium" : c)) : suggested.confidence;
      return { sheetIdx, mapping: saved || suggested.mapping, confidence: saved ? saved.map((f) => (f === IGNORE_COLUMN ? "none" : "high")) : confidence, notes: suggested.notes };
    },
    []
  );

  const handleFile = async (file) => {
    abortRef.current?.abort();
    setError("");
    set({ ...initialState(), file });
    setBusy({ label: "Reading document…" });
    try {
      const doc = await readProductDocument(file, { onStage: (label) => setBusy({ label }) });
      if (doc.scanned) {
        set({ doc });
        return;
      }
      set({ doc, step: "map", ...applyMapping(doc, doc.activeSheet, itemType) });
    } catch (err) {
      console.warn("[product-import] read failed", err);
      setError(err?.code ? err.message : "Could not read this file. Try saving it again or use the Excel template.");
    } finally {
      setBusy(null);
    }
  };

  const handleOcr = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setBusy({ label: "Reading scanned pages (OCR)…", progress: 0 });
    try {
      const doc = await readScannedPdf(state.doc.pdfBuffer, {
        signal: controller.signal,
        onProgress: (p) => setBusy({ label: "Reading scanned pages (OCR)…", progress: p }),
      });
      set({ doc, step: "map", ...applyMapping(doc, 0, itemType) });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("[product-import] OCR failed", err);
      setError(err?.code ? err.message : "This PDF appears to be scanned/image-based. Text could not be reliably extracted. Please upload an Excel/CSV file or a text-based PDF.");
      set((s) => ({ doc: { ...s.doc, scanned: false } }));
    } finally {
      setBusy(null);
    }
  };

  /** Server duplicate check for the given rows (keys from each row's normalised values). */
  const runDuplicateCheck = async (rows) => {
    const keys = rows.map((r) => {
      const { value } = validateImportRow(r.raw, { itemType, standardRate: standardVatRate });
      return { row_number: r.rowNumber, sku: value.sku, barcode: itemType === "product" ? value.barcode : null, name: value.name };
    });
    const { existing } = await checkImportDuplicates(itemType, keys);
    return existing;
  };

  const continueFromMap = async () => {
    if (!sheet) return;
    rememberMapping(itemType, sheet.table.headers, state.mapping);
    const rows = createReviewRows(sheet.table, state.mapping);
    if (!rows.length) {
      setError("No product rows were found with this mapping.");
      return;
    }
    setError("");
    setBusy({ label: "Checking duplicates…" });
    try {
      const existing = await runDuplicateCheck(rows);
      set({ rows, existing, step: "review" });
      setReviewFilter("all");
    } catch (err) {
      setError(err instanceof ProductImportApiError ? err.message : "Couldn't check for duplicates. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const continueFromReview = async () => {
    setError("");
    setBusy({ label: "Checking duplicates…" });
    try {
      // Edits may have changed SKUs / barcodes / names — check the latest values once more.
      const existing = await runDuplicateCheck(state.rows.filter((r) => r.selected));
      setBusy({ label: "Preparing import…" });
      set({ existing, step: "summary" });
    } catch (err) {
      setError(err instanceof ProductImportApiError ? err.message : "Couldn't check for duplicates. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const runImport = async (commitRows, { merge = false } = {}) => {
    setError("");
    set({ step: "importing" });
    setBusy({ label: `Importing 0 of ${commitRows.length}…`, progress: 0 });
    try {
      const results = await commitProductImport({
        importId: state.importId,
        itemType,
        rows: commitRows,
        standardRate: standardVatRate,
        onProgress: (done, total) => setBusy({ label: `Importing ${done} of ${total}…`, progress: total ? done / total : 1 }),
      });
      set((s) => {
        if (!merge || !s.results) return { results, step: "result" };
        const byRow = new Map(s.results.map((r) => [r.row_number, r]));
        for (const r of results) byRow.set(r.row_number, r);
        return { results: [...byRow.values()], step: "result" };
      });
      onImported?.();
    } catch (err) {
      console.warn("[product-import] import stopped", err);
      if (err?.code === "UPGRADE_REQUIRED") onUpgrade();
      setError(err instanceof ProductImportApiError ? err.message : "The import stopped unexpectedly. Rows already imported are safe — try again.");
      set({ step: "summary" });
      onImported?.();
    } finally {
      setBusy(null);
    }
  };

  const retryFailed = () => {
    const failedRows = new Set((state.results || []).filter((r) => r.outcome === "failed" && r.retryable).map((r) => r.row_number));
    runImport(toCommitRows(evaluated).filter((r) => failedRows.has(r.row_number)), { merge: true });
  };

  const onEdit = useCallback((id, field, value) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, raw: { ...r.raw, [field]: value } } : r)) }));
  }, []);
  const onToggle = useCallback((id, selected) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, selected } : r)) }));
  }, []);
  const onToggleMany = useCallback((ids, selected) => {
    const set_ = new Set(ids);
    setState((s) => ({ ...s, rows: s.rows.map((r) => (set_.has(r.id) ? { ...r, selected } : r)) }));
  }, []);
  const onAction = useCallback((id, action) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, action } : r)) }));
  }, []);

  const stepperKey = state.step === "summary" || state.step === "importing" || state.step === "result" ? "import" : state.step;
  const noun = itemType === "product" ? "Products" : "Services";
  const closeLocked = state.step === "importing";

  // ── Result ───────────────────────────────────────────────────────────────────────────────
  const resultView = (() => {
    if (state.step !== "result" || !state.results) return null;
    const counts = { created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const r of state.results) counts[r.outcome] = (counts[r.outcome] || 0) + 1;
    const problems = notImportedRows(evaluated, state.results);
    const skipped = problems.filter((p) => p.outcome === "skipped").length;
    const failed = problems.filter((p) => p.outcome === "failed").length;
    const retryable = state.results.some((r) => r.outcome === "failed" && r.retryable);
    const imported = counts.created + counts.updated;
    const lower = noun.toLowerCase();
    return (
      <DoneState
        variant="dialog"
        tone={imported === 0 ? "failed" : failed ? "pending" : "success"}
        title={imported === 0 ? "Nothing was imported" : "Import complete"}
        message={
          <ul className="space-y-1 text-sm">
            <li className="text-emerald-700 dark:text-emerald-400">✓ {counts.created.toLocaleString()} {lower} imported</li>
            {counts.updated ? <li className="text-emerald-700 dark:text-emerald-400">↻ {counts.updated.toLocaleString()} existing {lower} updated</li> : null}
            <li className="text-amber-700 dark:text-amber-400">⚠ {skipped.toLocaleString()} {lower} skipped</li>
            <li className="text-destructive">✕ {failed.toLocaleString()} {lower} failed</li>
          </ul>
        }
        actions={[
          { label: `View ${lower}`, onClick: () => onOpenChange(false) },
          ...(problems.length ? [{ label: "Download error report", icon: Download, variant: "outline", onClick: () => downloadErrorReport(problems, state.file?.name) }] : []),
          { label: "Import another file", icon: Upload, variant: "outline", onClick: () => set(initialState()) },
        ]}
        pending={
          retryable ? (
            <Button type="button" variant="outline" size="sm" onClick={retryFailed}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Retry failed rows
            </Button>
          ) : null
        }
        followUp={imported && itemType === "product" ? "Opening stock was recorded as stock movements, so your inventory history starts here." : null}
      />
    );
  })();

  // ── Summary ──────────────────────────────────────────────────────────────────────────────
  const summaryView =
    state.step === "summary" || state.step === "importing" ? (
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Import Summary</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Total rows", value: summary.total },
            { label: "Ready", value: summary.ready, cls: "text-emerald-700 dark:text-emerald-400" },
            { label: "Warnings", value: summary.warning, cls: "text-amber-700 dark:text-amber-400" },
            { label: "Errors", value: summary.error, cls: "text-destructive" },
            { label: "Duplicates", value: summary.duplicate, cls: "text-sky-700 dark:text-sky-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</dt>
              <dd className={`text-xl font-semibold tabular-nums ${s.cls || ""}`}>{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">{summary.creates.toLocaleString()}</span> new {noun.toLowerCase()} will be added
            {summary.updates ? (
              <>
                {" "}
                and <span className="font-medium text-foreground">{summary.updates.toLocaleString()}</span> existing will be updated (only the fields in your file)
              </>
            ) : null}
            .
          </li>
          {summary.skipped ? <li>{summary.skipped.toLocaleString()} duplicate(s) will be skipped.</li> : null}
          {summary.unselected ? <li>{summary.unselected.toLocaleString()} unticked row(s) won&apos;t be imported.</li> : null}
          {summary.errorsSelected ? (
            <li className="text-destructive">{summary.errorsSelected.toLocaleString()} row(s) have errors and can&apos;t be imported until they&apos;re fixed.</li>
          ) : null}
        </ul>
        {state.step === "importing" && busy ? (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {busy.label}
            </p>
            <Progress value={Math.round((busy.progress || 0) * 100)} />
            <p className="text-xs text-muted-foreground">Keep this window open until the import finishes.</p>
          </div>
        ) : null}
      </div>
    ) : null;

  const body = (() => {
    if (state.step === "upload") {
      return (
        <ImportUploadStep
          itemType={itemType}
          onItemTypeChange={setItemType}
          canImportProducts={canImportProducts}
          onUpgrade={onUpgrade}
          file={state.file}
          onFile={handleFile}
          onRemoveFile={() => set(initialState())}
          busy={busy}
          error={error}
          scanned={Boolean(state.doc?.scanned)}
          onTryOcr={handleOcr}
        />
      );
    }
    if (state.step === "map" && sheet) {
      return (
        <ImportMapStep
          sheets={state.doc.sheets}
          sheetIdx={state.sheetIdx}
          onSheetChange={(i) => set(applyMapping(state.doc, i, itemType))}
          table={sheet.table}
          mapping={state.mapping}
          confidence={state.confidence}
          notes={state.notes}
          itemType={itemType}
          onMappingChange={(mapping) => set({ mapping })}
          notices={state.doc.notices}
        />
      );
    }
    if (state.step === "review") {
      return (
        <ImportReviewStep
          rows={evaluated}
          summary={summary}
          itemType={itemType}
          initialFilter={reviewFilter}
          onEdit={onEdit}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
          onAction={onAction}
        />
      );
    }
    if (state.step === "result") return resultView;
    return summaryView;
  })();

  const footer = (() => {
    const cancel = (
      <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={closeLocked}>
        Cancel
      </Button>
    );
    if (state.step === "map") {
      return (
        <>
          {cancel}
          <Button type="button" variant="outline" onClick={() => set({ step: "upload" })} disabled={Boolean(busy)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <Button type="button" onClick={continueFromMap} disabled={Boolean(busy) || !state.mapping.includes("name")}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? busy.label : "Continue to review"}
          </Button>
        </>
      );
    }
    if (state.step === "review") {
      return (
        <>
          {cancel}
          <Button type="button" variant="outline" onClick={() => set({ step: "map" })} disabled={Boolean(busy)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <Button type="button" onClick={continueFromReview} disabled={Boolean(busy) || summary.importable === 0}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? busy.label : `Continue with ${summary.importable.toLocaleString()} ${summary.importable === 1 ? "row" : "rows"}`}
          </Button>
        </>
      );
    }
    if (state.step === "summary") {
      const commitRows = toCommitRows(evaluated);
      const n = commitRows.length;
      return (
        <>
          {cancel}
          <Button type="button" variant="outline" onClick={() => set({ step: "review" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          {summary.errorsSelected ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReviewFilter(ROW_STATUS.ERROR);
                set({ step: "review" });
              }}
            >
              Fix errors
            </Button>
          ) : null}
          <Button type="button" onClick={() => runImport(commitRows)} disabled={n === 0}>
            {summary.errorsSelected ? `Import ready ${noun.toLowerCase()} only (${n.toLocaleString()})` : `Import ${n.toLocaleString()} ${n === 1 ? noun.slice(0, -1) : noun}`}
          </Button>
        </>
      );
    }
    if (state.step === "importing") {
      return (
        <Button type="button" disabled>
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          Importing…
        </Button>
      );
    }
    if (state.step === "upload") return cancel;
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => (closeLocked && !next ? undefined : onOpenChange(next))}>
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-3 border-b px-4 py-4 pr-14 sm:px-6">
          <DialogTitle>{state.step === "review" ? `Review ${noun}` : `Import ${noun}`}</DialogTitle>
          <DialogDescription className="sr-only">Upload a product document, map its columns, review the rows and import them.</DialogDescription>
          {state.file && state.step !== "upload" ? (
            <p className="truncate text-xs text-muted-foreground" title={state.file.name}>
              {state.file.name}
            </p>
          ) : null}
          <ImportStepper current={stepperKey} />
        </DialogHeader>
        <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 ${state.step === "review" ? "flex flex-col" : ""}`}>
          {body}
          {error && state.step !== "upload" ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
