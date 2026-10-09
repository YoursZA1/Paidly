import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2, ScanText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import DoneState from "@/components/shared/DoneState";
import ImportStepper from "@/components/inventory/import/ImportStepper";
import { cn } from "@/lib/utils";
import { IMPORT_ACCEPT, formatFileSize } from "@/lib/productImport/fileDetect.js";
import { downloadBlob } from "@/lib/productImport/importFiles.js";
import { readProductDocument, readScannedPdf } from "@/lib/productImport/readProductDocument.js";
import {
  CLIENT_IMPORT_FIELDS,
  CLIENT_IMPORT_LIMITS,
  CLIENT_TEMPLATE_HEADERS,
  CLIENT_TEMPLATE_ROWS,
  IGNORE_COLUMN,
  applyColumnMapping,
  clientReportCsv,
  defaultDecision,
  fileDuplicates,
  headerSignature,
  missingRequiredFields,
  planCounts,
  suggestColumnMapping,
  toCsv,
  validateClientImportRow,
} from "@shared/clients/clientImport.js";
import { checkClientDuplicates, commitClientImport, listClientImportRuns } from "@/services/ClientImportService";

const PAGE = 25;
const ACCESS_ERRORS = new Set(["UNAUTHORIZED", "NO_COMPANY", "FORBIDDEN", "UPGRADE_REQUIRED", "SUBSCRIPTION_REQUIRED"]);
const IDENTITY_FIELDS = new Set(["email", "phone", "tax_id"]);
const MATCH_LABEL = { email: "email", phone: "phone", tax_id: "VAT number" };
const matchLabel = (key) => MATCH_LABEL[key] || key;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const FIELD_LABEL = Object.fromEntries(CLIENT_IMPORT_FIELDS.map((f) => [f.key, f.label.toLowerCase()]));
const MAP_KEY = "paidly-client-import-map";

function kindOf(file) {
  const ext = String(file?.name || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return { label: "PDF", Icon: FileText };
  if (ext === "csv") return { label: "CSV", Icon: FileSpreadsheet };
  return { label: "Excel", Icon: FileSpreadsheet };
}

function downloadCsvTemplate() {
  downloadBlob(
    new Blob([toCsv([CLIENT_TEMPLATE_HEADERS, ...CLIENT_TEMPLATE_ROWS])], { type: "text/csv;charset=utf-8" }),
    "paidly-client-import-template.csv"
  );
}

async function downloadExcelTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([CLIENT_TEMPLATE_HEADERS, ...CLIENT_TEMPLATE_ROWS]);
  ws["!cols"] = CLIENT_TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  XLSX.writeFile(wb, "paidly-client-import-template.xlsx");
}

function buildRows(table, mapping) {
  const rows = [];
  let blank = 0;
  (table?.rows || []).forEach((cells, i) => {
    const checked = validateClientImportRow(applyColumnMapping(mapping, cells));
    if (checked.empty) {
      blank += 1;
      return;
    }
    const meta = table.rowMeta?.[i];
    if (meta?.ocr) checked.warnings.push({ field: "", message: "Read with text recognition. Check every value in this row." });
    else if (meta?.messy) checked.warnings.push({ field: "", message: "Two values in the PDF landed in one column. Check this row." });
    // PDF rows have no spreadsheet row number: number them from 1 in reading order.
    rows.push({ row_number: table.rowNumbers?.[i] || (meta ? i + 1 : i + 2), ...checked, meta: meta || null });
  });
  return { rows, blank };
}

function decisionFor(row, dupMap, matchMap, overrides) {
  return overrides[row.row_number] || defaultDecision(row, dupMap.get(row.row_number), matchMap.get(row.row_number));
}

function reportEntries(rows, results) {
  const byRow = new Map(rows.map((r) => [r.row_number, r]));
  return results.map((result) => {
    const row = byRow.get(result.row_number);
    return {
      row_number: result.row_number,
      values: row?.value || {},
      result: result.outcome,
      details: [result.reason, result.fix].filter(Boolean).join(" "),
    };
  });
}

export default function ClientImportDialog({ open, onOpenChange, onImported }) {
  const inputRef = useRef(null);
  // Bumped by reset() and by each new file. Async work from an older epoch (a replaced file, a closed
  // dialog, a slow OCR run) must not write into the current one.
  const epochRef = useRef(0);
  const ocrAbortRef = useRef(null);
  const [step, setStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [doc, setDoc] = useState(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState([]);
  const [confidence, setConfidence] = useState([]);
  const [mapNotes, setMapNotes] = useState([]);
  const [rows, setRows] = useState([]);
  const [blankCount, setBlankCount] = useState(0);
  const [overrides, setOverrides] = useState({});
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ocrNote, setOcrNote] = useState("");
  const [filter, setFilter] = useState("attention");
  const [page, setPage] = useState(0);
  const [importId, setImportId] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [runs, setRuns] = useState([]);
  const [dragging, setDragging] = useState(false);
  // Rows edited in the current view stay visible until the filter changes, so a row never vanishes
  // mid-typing. Rows whose email, phone or VAT changed are checked against existing clients again.
  const [pinned, setPinned] = useState(() => new Set());
  const [recheck, setRecheck] = useState(() => new Set());

  const sheet = doc?.sheets?.[sheetIdx] || null;
  const closeLocked = step === "importing";

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    listClientImportRuns()
      .then((json) => {
        if (!cancelled) setRuns(json.runs || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    epochRef.current += 1;
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = null;
    setStep("upload");
    setFile(null);
    setDoc(null);
    setSheetIdx(0);
    setMapping([]);
    setConfidence([]);
    setMapNotes([]);
    setRows([]);
    setBlankCount(0);
    setOverrides({});
    setMatches([]);
    setBusy("");
    setError("");
    setOcrNote("");
    setFilter("attention");
    setPage(0);
    setImportId("");
    setProgress({ done: 0, total: 0 });
    setResults(null);
    setPinned(new Set());
    setRecheck(new Set());
  }


  function rememberMapping(headers, nextMapping) {
    try {
      const raw = sessionStorage.getItem(MAP_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      saved[headerSignature(headers)] = nextMapping;
      sessionStorage.setItem(MAP_KEY, JSON.stringify(saved));
    } catch {
      /* private mode */
    }
  }

  function mappingFor(headers) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(MAP_KEY) || "{}");
      const prior = saved[headerSignature(headers)];
      if (Array.isArray(prior) && prior.length === headers.length) return { mapping: prior, confidence: prior.map(() => "high"), notes: prior.map(() => null), remembered: true };
    } catch {
      /* ignore */
    }
    return { ...suggestColumnMapping(headers), remembered: false };
  }

  /** Back to an empty upload step. Anything still reading the old file is ignored or stopped. */
  function clearFile() {
    reset();
  }

  async function acceptFile(next) {
    if (!next) return;
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = null;
    const epoch = ++epochRef.current;
    const live = () => epoch === epochRef.current;
    setError("");
    setOcrNote("");
    setResults(null);
    setBusy("Reading file…");
    setFile(next);
    try {
      const read = await readProductDocument(next, { profile: "client", onStage: (stage) => live() && setBusy(stage) });
      if (!live()) return;
      if (read.scanned) {
        setDoc(read);
        setStep("upload");
        setBusy("");
        return;
      }
      const idx = read.activeSheet >= 0 ? read.activeSheet : 0;
      const table = read.sheets[idx]?.table;
      const suggested = mappingFor(table?.headers || []);
      setDoc(read);
      setSheetIdx(idx);
      setMapping(suggested.mapping);
      setConfidence(suggested.confidence);
      setMapNotes(suggested.notes);
      setImportId(crypto.randomUUID());
      setStep("map");
    } catch (err) {
      if (!live()) return;
      setDoc(null);
      setError(err?.message || "This file couldn't be read.");
    } finally {
      if (live()) setBusy("");
    }
  }

  async function tryOcr() {
    if (!doc?.pdfBuffer) return;
    const epoch = epochRef.current;
    const live = () => epoch === epochRef.current;
    const controller = new AbortController();
    ocrAbortRef.current = controller;
    setError("");
    setBusy("Reading scanned PDF…");
    try {
      const read = await readScannedPdf(doc.pdfBuffer, {
        profile: "client",
        signal: controller.signal,
        onProgress: (fraction) => live() && setBusy(`Reading scanned PDF… ${Math.round(fraction * 100)}%`),
      });
      if (!live()) return;
      const table = read.sheets[0]?.table;
      const suggested = mappingFor(table?.headers || []);
      setDoc(read);
      setSheetIdx(0);
      setMapping(suggested.mapping);
      setConfidence(suggested.confidence);
      setMapNotes(suggested.notes);
      setOcrNote(read.notices?.[0] || "This PDF was read with on-device text recognition. Check every value before importing.");
      setImportId(crypto.randomUUID());
      setStep("map");
    } catch (err) {
      if (!live()) return;
      setError(err?.message || "This scanned PDF could not be read. Upload an Excel or CSV file instead.");
    } finally {
      if (ocrAbortRef.current === controller) ocrAbortRef.current = null;
      if (live()) setBusy("");
    }
  }

  function chooseSheet(idx) {
    const table = doc.sheets[idx]?.table;
    const suggested = mappingFor(table?.headers || []);
    setSheetIdx(idx);
    setMapping(suggested.mapping);
    setConfidence(suggested.confidence);
    setMapNotes(suggested.notes);
  }

  function setColumn(col, field) {
    setMapping((prev) => {
      const next = prev.map((f, i) => (i !== col && f === field && field !== IGNORE_COLUMN ? IGNORE_COLUMN : f));
      next[col] = field;
      return next;
    });
    setConfidence((prev) => prev.map((c, i) => (i === col ? "high" : c)));
  }

  const dupMap = useMemo(() => fileDuplicates(rows), [rows]);
  const matchMap = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      if (m.matches?.length) map.set(m.row_number, { reliable: m.reliable, matches: m.matches });
    }
    return map;
  }, [matches]);

  const summary = useMemo(() => {
    const decisions = {
      get(rowNumber) {
        const row = rows.find((r) => r.row_number === rowNumber);
        if (!row) return null;
        return decisionFor(row, dupMap, matchMap, overrides);
      },
    };
    return planCounts(rows, decisions);
  }, [rows, dupMap, matchMap, overrides]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (pinned.has(row.row_number)) return true;
      const decision = decisionFor(row, dupMap, matchMap, overrides);
      const attention = row.errors.length || row.warnings.length || decision.reason === "file_duplicate" || decision.reason === "existing" || decision.reason === "uncertain";
      if (filter === "attention") return attention;
      if (filter === "invalid") return row.errors.length > 0;
      if (filter === "duplicates") return decision.reason === "file_duplicate" || decision.reason === "existing" || decision.reason === "uncertain";
      if (filter === "ready") return !row.errors.length && decision.action !== "skip";
      return true;
    });
  }, [rows, dupMap, matchMap, overrides, filter, pinned]);

  const problems = useMemo(() => {
    const c = { missing: 0, email: 0, phone: 0, other: 0, warnings: 0 };
    for (const row of rows) {
      if (row.warnings.length) c.warnings += 1;
      if (!row.errors.length) continue;
      if (row.errors.some((e) => /is required/.test(e.message))) c.missing += 1;
      else if (row.errors.some((e) => e.field === "email" || e.field === "alternate_email")) c.email += 1;
      else if (row.errors.some((e) => e.field === "phone" || e.field === "fax")) c.phone += 1;
      else c.other += 1;
    }
    return c;
  }, [rows]);

  /** What the confirm step lists: every row by number and name, and the fields an update replaces. */
  const plan = useMemo(() => {
    if (step !== "import") return null;
    const out = { create: [], update: [], skip: [] };
    const names = new Map();
    for (const m of matches) for (const c of m.matches || []) names.set(c.id, c.name);
    for (const row of rows) {
      if (row.errors.length) continue;
      const d = decisionFor(row, dupMap, matchMap, overrides);
      const label = `Row ${row.row_number}: ${row.value.name}`;
      if (d.action === "create") out.create.push(label);
      else if (d.action === "update") {
        const fields = row.provided.map((k) => FIELD_LABEL[k] || k).join(", ");
        out.update.push(`${label} → ${names.get(d.targetId) || "existing client"} (replaces ${fields})`);
      } else out.skip.push(label);
    }
    return out;
  }, [step, rows, dupMap, matchMap, overrides, matches]);

  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const unmappedRequired = missingRequiredFields(mapping);

  async function goReview() {
    if (unmappedRequired.length) return;
    const table = doc.sheets[sheetIdx].table;
    rememberMapping(table.headers, mapping);
    const built = buildRows(table, mapping);
    setRows(built.rows);
    setBlankCount(built.blank);
    setOverrides({});
    setPinned(new Set());
    setRecheck(new Set());
    setBusy("Checking existing clients…");
    setError("");
    const epoch = epochRef.current;
    try {
      const found = await checkClientDuplicates(built.rows);
      if (epoch !== epochRef.current) return;
      setMatches(found.matches || []);
    } catch (err) {
      if (epoch !== epochRef.current) return;
      setMatches([]);
      if (ACCESS_ERRORS.has(err?.code)) {
        // Importing would be refused anyway. Say why now, before the user reviews every row.
        setError(err.message);
        setBusy("");
        return;
      }
      const why = err?.message || "Existing clients couldn't be checked.";
      setError(`${why} You can still review this file. Nothing is saved until you confirm, and the server checks for duplicates again when you import.`);
    }
    setBusy("");
    setStep("review");
    setPage(0);
  }

  function editCell(rowNumber, field, text) {
    setRows((prev) => prev.map((row) => {
      if (row.row_number !== rowNumber) return row;
      const next = validateClientImportRow({ ...row.value, [field]: text });
      // Keep the PDF / OCR reminder after an edit: the other values in the row are still unchecked.
      const source = row.warnings.filter((w) => w.field === "");
      return { ...row, ...next, warnings: [...source, ...next.warnings] };
    }));
    setPinned((prev) => (prev.has(rowNumber) ? prev : new Set(prev).add(rowNumber)));
    if (!IDENTITY_FIELDS.has(field)) return;
    // A changed email, phone or VAT number is a different identity: the old match and choice no longer apply.
    setOverrides((prev) => {
      if (!prev[rowNumber]) return prev;
      const next = { ...prev };
      delete next[rowNumber];
      return next;
    });
    setMatches((prev) => prev.filter((m) => m.row_number !== rowNumber));
    setRecheck((prev) => (prev.has(rowNumber) ? prev : new Set(prev).add(rowNumber)));
  }

  /** Re-check edited identities before the summary, so the counts on the confirm step are true. */
  async function goConfirm() {
    setError("");
    const edited = rows.filter((r) => recheck.has(r.row_number) && !r.errors.length);
    if (edited.length) {
      setBusy("Checking edited rows…");
      const epoch = epochRef.current;
      try {
        const found = await checkClientDuplicates(edited);
        if (epoch !== epochRef.current) return;
        const hits = (found.matches || []).filter((m) => m.matches?.length);
        setMatches((prev) => [...prev.filter((m) => !recheck.has(m.row_number)), ...hits]);
        setRecheck(new Set());
        if (hits.length) {
          setBusy("");
          setFilter("duplicates");
          setPinned(new Set());
          setPage(0);
          setError(`${hits.length === 1 ? "An edited row matches" : `${hits.length} edited rows match`} an existing client. Choose what to do with ${hits.length === 1 ? "it" : "them"}, then continue.`);
          return;
        }
      } catch (err) {
        if (epoch !== epochRef.current) return;
        if (ACCESS_ERRORS.has(err?.code)) {
          setBusy("");
          setError(err.message);
          return;
        }
        // The server checks duplicates again on import, so an unchecked edit can't create one.
      }
      setBusy("");
    }
    setStep("import");
  }

  function setDecision(rowNumber, decision) {
    setOverrides((prev) => ({ ...prev, [rowNumber]: decision }));
  }

  function applyToDuplicates(mode) {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (row.errors.length) continue;
        const base = defaultDecision(row, dupMap.get(row.row_number), matchMap.get(row.row_number));
        if (base.reason !== "existing" && base.reason !== "uncertain" && base.reason !== "file_duplicate") continue;
        if (mode === "skip") next[row.row_number] = { ...base, action: "skip", allowDuplicate: false };
        if (mode === "update" && base.reason === "existing" && base.targetId) {
          next[row.row_number] = { ...base, action: "update", allowDuplicate: false };
        }
        if (mode === "new") next[row.row_number] = { ...base, action: "create", allowDuplicate: true };
      }
      return next;
    });
  }

  async function runImport(onlyFailed = false) {
    const payload = [];
    for (const row of rows) {
      const decision = decisionFor(row, dupMap, matchMap, overrides);
      if (row.errors.length) continue;
      if (onlyFailed && !results?.some((r) => r.row_number === row.row_number && (r.outcome === "failed" || r.outcome === "remaining"))) continue;
      payload.push({
        row_number: row.row_number,
        action: decision.action === "update" ? "update" : decision.action === "create" ? "create" : "skip",
        target_id: decision.action === "update" ? decision.targetId : null,
        allow_duplicate: decision.action === "create" && decision.allowDuplicate === true,
        skip_reason: decision.action === "skip" ? decision.reason : undefined,
        values: row.value,
      });
    }
    if (!payload.length) {
      setError("Nothing is ready to import. Correct the rows that need attention, or choose what to do with duplicates.");
      return;
    }
    setStep("importing");
    setError("");
    setProgress({ done: 0, total: payload.length });
    try {
      const serverResults = await commitClientImport({
        importId,
        filename: file?.name || "clients",
        rows: payload,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      const invalid = rows.filter((r) => r.errors.length).map((r) => ({
        row_number: r.row_number,
        outcome: "failed",
        reason: r.errors[0].message,
        fix: r.errors[0].fix,
      }));
      const merged = onlyFailed
        ? [...(results || []).filter((r) => r.outcome !== "failed" && r.outcome !== "remaining"), ...serverResults, ...invalid]
        : [...serverResults, ...invalid];
      setResults(merged);
      const stopped = serverResults.find((r) => r.stopped);
      if (stopped) setError(`The import stopped: ${stopped.reason}`);
      const created = merged.filter((r) => r.outcome === "created" || r.outcome === "updated").length;
      if (created) onImported?.();
      setStep("done");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "The import stopped. Retry the failed rows — clients already saved won't be duplicated.");
      setStep("import");
    }
  }

  function download(kind) {
    const list = (results || []).filter((r) => {
      if (kind === "created") return r.outcome === "created" || r.outcome === "updated";
      if (kind === "skipped") return r.outcome === "skipped";
      return r.outcome === "failed" || r.outcome === "remaining";
    });
    const name = kind === "created" ? "imported" : kind === "skipped" ? "skipped" : "failed";
    downloadBlob(new Blob([clientReportCsv(reportEntries(rows, list))], { type: "text/csv;charset=utf-8" }), `paidly-clients-${name}.csv`);
  }

  const resultCounts = useMemo(() => {
    const c = { created: 0, updated: 0, skipped: 0, failed: 0, remaining: 0, replayed: 0, duplicates: 0 };
    for (const r of results || []) {
      if (r.outcome === "created" && r.replayed) c.replayed += 1;
      else if (r.outcome === "created") c.created += 1;
      else if (c[r.outcome] != null) c[r.outcome] += 1;
      if (r.outcome === "skipped" && r.duplicate) c.duplicates += 1;
    }
    return c;
  }, [results]);

  const kind = file ? kindOf(file) : null;
  const notices = [...new Set([...(doc?.notices || []), ocrNote].filter(Boolean))];

  // Every way of closing (X, Escape, the Close button) clears the file and results from memory.
  function handleOpenChange(next) {
    if (next) return onOpenChange(true);
    if (closeLocked) return undefined;
    reset();
    return onOpenChange(false);
  }

  const footer = (() => {
    if (step === "map") {
      return (
        <>
          <Button type="button" variant="outline" onClick={clearFile}>Replace file</Button>
          <Button type="button" disabled={unmappedRequired.length > 0 || !sheet?.table?.rows?.length} onClick={goReview}>Review clients</Button>
        </>
      );
    }
    if (step === "review") {
      return (
        <>
          <Button type="button" variant="outline" onClick={() => setStep("map")}>Back</Button>
          <Button type="button" onClick={goConfirm} disabled={!rows.length || Boolean(busy)}>Continue</Button>
        </>
      );
    }
    if (step === "import") {
      return (
        <>
          <Button type="button" variant="outline" onClick={() => setStep("review")}>Back</Button>
          <Button type="button" onClick={() => runImport(false)} disabled={summary.create + summary.update === 0}>
            Import {summary.create} new{summary.update ? ` · update ${summary.update}` : ""}
          </Button>
        </>
      );
    }
    if (step === "done") {
      return <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>;
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[90vh]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-3 border-b px-4 py-4 pr-14 sm:px-6">
          <DialogTitle>Import clients</DialogTitle>
          <DialogDescription className="sr-only">Upload a client list, map columns, review every row, then import into this business.</DialogDescription>
          {file && step !== "upload" ? <p className="truncate text-xs text-muted-foreground">{file.name}</p> : null}
          <ImportStepper current={step === "importing" || step === "done" ? "import" : step} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {step === "upload" ? (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Upload a CSV, Excel or text PDF of your customers. Paidly reads it in your browser, then you map the columns and confirm before anything is saved.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={downloadCsvTemplate}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Sample CSV
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => downloadExcelTemplate()}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Sample Excel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                CSV, Excel (.xlsx, .xls) and text PDF. Up to {Math.round(CLIENT_IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB and {CLIENT_IMPORT_LIMITS.maxRows.toLocaleString()} rows. Larger lists should be split. Scanned PDFs can be tried with on-device text recognition, which is not guaranteed. Password-protected files need the password removed first.
              </p>
              {!file || !doc?.scanned ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                  className={cn("flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center", dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30")}
                >
                  {busy ? <Loader2 className="mb-2 h-6 w-6 animate-spin" aria-hidden="true" /> : <Upload className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />}
                  <p className="text-sm font-medium">{busy || "Drop a file here, or browse"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Nothing is saved until you confirm the import.</p>
                </div>
              ) : null}
              <input ref={inputRef} type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ""; }} />
              {doc?.scanned ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">This PDF looks scanned or image-based.</p>
                  <p className="mt-1">Paidly can try on-device text recognition. It is not guaranteed, and every value will need a check. A CSV or Excel file is more reliable.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={tryOcr} disabled={Boolean(busy)}>
                      <ScanText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {busy || "Try text recognition"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={clearFile}>Choose another file</Button>
                  </div>
                </div>
              ) : null}
              {file && !doc?.scanned && !busy ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{kind?.label} · {formatFileSize(file.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove file" onClick={clearFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
              {runs.length ? (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Recent imports</p>
                  <ul className="mt-1 space-y-1">
                    {runs.slice(0, 5).map((run) => (
                      <li key={run.id}>
                        {run.created_at ? `${new Date(run.created_at).toLocaleDateString()} · ` : ""}
                        {run.filename || "Import"} · {run.created_count} created · {run.updated_count} updated · {run.skipped_count} skipped · {run.failed_count} failed
                        {run.status === "partial" ? " · partly imported" : run.status === "failed" ? " · not imported" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "map" && sheet ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {file.name} · {(sheet.table.rows || []).length.toLocaleString()} rows
                {doc.sheets.length > 1 ? ` · worksheet ${sheetIdx + 1} of ${doc.sheets.length}` : ""}. Map each column to a Paidly client field, or ignore it.
              </p>
              {doc.sheets.length > 1 ? (
                <label className="block text-sm">
                  Worksheet
                  <select className="mt-1 w-full rounded-lg border bg-background px-3 py-2" value={sheetIdx} onChange={(e) => chooseSheet(Number(e.target.value))}>
                    {doc.sheets.map((s, i) => <option key={s.name || i} value={i}>{s.name || `Sheet ${i + 1}`} ({s.table.rows.length} rows)</option>)}
                  </select>
                </label>
              ) : null}
              {unmappedRequired.length ? (
                <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  Map a column to {unmappedRequired.map((key) => CLIENT_IMPORT_FIELDS.find((f) => f.key === key)?.label || key).join(" and ")} before continuing. Paidly needs a name and an email for every client, the same as Add client.
                </p>
              ) : null}
              {notices.map((n) => <p key={n} className="text-sm text-amber-800 dark:text-amber-200">{n}</p>)}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Column in file</th>
                      <th className="py-2 pr-3 font-medium">Paidly field</th>
                      <th className="py-2 font-medium">Sample</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.table.headers.map((header, col) => (
                      <tr key={`${header}-${col}`} className="border-b border-border/60">
                        <td className="py-2 pr-3">
                          {header}
                          {confidence[col] === "medium" ? <span className="ml-2 text-xs text-amber-700">Check</span> : null}
                          {mapNotes[col] ? <span className="mt-0.5 block text-xs text-muted-foreground">{mapNotes[col]}</span> : null}
                        </td>
                        <td className="py-2 pr-3">
                          <select className="w-full rounded-md border bg-background px-2 py-1.5" value={mapping[col] || IGNORE_COLUMN} onChange={(e) => setColumn(col, e.target.value)} aria-label={`Map ${header}`}>
                            <option value={IGNORE_COLUMN}>Ignore</option>
                            {CLIENT_IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " (required)" : ""}</option>)}
                          </select>
                        </td>
                        <td className="max-w-[12rem] truncate py-2 text-muted-foreground">{sheet.table.rows[0]?.[col] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Rows", rows.length + blankCount],
                  ["Ready to add", summary.create],
                  ["Duplicates", rows.filter((r) => ["existing", "uncertain", "file_duplicate"].includes(decisionFor(r, dupMap, matchMap, overrides).reason)).length],
                  ["Need a correction", summary.invalid],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl border px-3 py-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{n}</p>
                  </div>
                ))}
              </div>
              {summary.invalid || problems.warnings ? (
                <p className="text-xs text-muted-foreground">
                  {[
                    problems.missing ? `${problems.missing} missing a name or email` : null,
                    problems.email ? `${problems.email} with an invalid email` : null,
                    problems.phone ? `${problems.phone} with an invalid phone or fax` : null,
                    problems.other ? `${problems.other} with another invalid value` : null,
                    problems.warnings ? `${problems.warnings} with a warning to check` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {blankCount ? <p className="text-xs text-muted-foreground">{blankCount} blank {blankCount === 1 ? "row was" : "rows were"} left out.</p> : null}
              {notices.map((n) => <p key={n} className="text-sm text-amber-800 dark:text-amber-200">{n}</p>)}
              <div className="flex flex-wrap gap-2">
                {[
                  ["attention", "Needs attention"],
                  ["all", "All"],
                  ["invalid", "Invalid"],
                  ["duplicates", "Duplicates"],
                  ["ready", "Ready"],
                ].map(([key, label]) => (
                  <Button key={key} type="button" size="sm" variant={filter === key ? "default" : "outline"} onClick={() => { setFilter(key); setPinned(new Set()); setPage(0); }}>{label}</Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button type="button" size="sm" variant="outline" onClick={() => applyToDuplicates("skip")}>Skip duplicates</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyToDuplicates("update")}>Update reliable matches</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => applyToDuplicates("new")}>Import duplicates as new</Button>
              </div>
              <p className="text-xs text-muted-foreground">Duplicates match email, phone or VAT number in this business and inside the file. The same name alone is not a duplicate. Updating only happens when you choose it and the match is a single client. Blank cells do not erase existing details.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2">Row</th>
                      <th className="py-2 pr-2">Name</th>
                      <th className="py-2 pr-2">Email</th>
                      <th className="py-2 pr-2">Phone</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => {
                      const decision = decisionFor(row, dupMap, matchMap, overrides);
                      const existing = matchMap.get(row.row_number);
                      return (
                        <tr key={row.row_number} className="border-b align-top">
                          <td className="py-2 pr-2 tabular-nums text-muted-foreground">{row.row_number}</td>
                          {["name", "email", "phone"].map((field) => (
                            <td key={field} className="py-2 pr-2">
                              <input
                                aria-label={`${field} on row ${row.row_number}`}
                                className="w-full min-w-[8rem] rounded-md border bg-background px-2 py-1"
                                value={row.value[field] || ""}
                                onChange={(e) => editCell(row.row_number, field, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="py-2">
                            {row.errors.length ? <p className="text-xs text-destructive">{row.errors.map((e) => e.message).join(" ")} {row.errors[0]?.fix}</p> : null}
                            {row.errors.filter((e) => !["name", "email", "phone"].includes(e.field)).map((e) => (
                              <label key={e.field} className="mt-1 block text-xs text-muted-foreground">
                                {CLIENT_IMPORT_FIELDS.find((f) => f.key === e.field)?.label || e.field}
                                <input
                                  aria-label={`${e.field} on row ${row.row_number}`}
                                  className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm text-foreground"
                                  value={row.value[e.field] || ""}
                                  onChange={(ev) => editCell(row.row_number, e.field, ev.target.value)}
                                />
                              </label>
                            ))}
                            {row.warnings.map((w) => <p key={w.message} className="text-xs text-amber-700">{w.message}</p>)}
                            {decision.reason === "file_duplicate" ? <p className="text-xs text-amber-800">Same {matchLabel(decision.matchedBy)} as row {decision.fileRow} in this file.</p> : null}
                            {existing ? (
                              <p className="text-xs text-amber-800">
                                {existing.reliable ? "Matches" : "Might match"} {existing.matches.map((m) => m.name || "a client").join(", ")} ({existing.matches.map((m) => m.matchedBy.map(matchLabel).join(", ")).join("; ")}).
                              </p>
                            ) : null}
                            {!row.errors.length ? (
                              <select
                                className="mt-1 w-full rounded-md border bg-background px-2 py-1"
                                aria-label={`Action for row ${row.row_number}`}
                                value={
                                  decision.action === "update" && decision.targetId
                                    ? `update:${decision.targetId}`
                                    : decision.action === "create" && decision.allowDuplicate
                                      ? "new"
                                      : decision.action
                                }
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === "skip") setDecision(row.row_number, { ...decision, action: "skip", allowDuplicate: false });
                                  if (value === "create") setDecision(row.row_number, { ...decision, action: "create", allowDuplicate: false, targetId: null });
                                  if (value === "new") setDecision(row.row_number, { ...decision, action: "create", allowDuplicate: true, targetId: null });
                                  if (value.startsWith("update:")) setDecision(row.row_number, { ...decision, action: "update", allowDuplicate: false, targetId: value.slice(7) });
                                }}
                              >
                                {!existing && decision.reason !== "file_duplicate" ? <option value="create">Import as new</option> : null}
                                <option value="skip">Skip</option>
                                {existing?.reliable ? <option value={`update:${existing.matches[0].id}`}>Update {existing.matches[0].name || "existing client"}</option> : null}
                                {existing && !existing.reliable ? existing.matches.map((m) => <option key={m.id} value={`update:${m.id}`}>Update {m.name || m.id}</option>) : null}
                                {(decision.reason === "file_duplicate" || existing) ? <option value="new">Import as a separate client</option> : null}
                              </select>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visible.length > PAGE ? (
                <div className="flex items-center justify-between text-sm">
                  <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="text-muted-foreground">Page {page + 1} of {pageCount}</span>
                  <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              ) : null}
              {!visible.length ? <p className="text-sm text-muted-foreground">No rows in this view.</p> : null}
            </div>
          ) : null}

          {step === "import" && plan ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium">Confirm this import</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>{plural(summary.create, "client", "clients")} will be created.</li>
                <li>{plural(summary.update, "existing client", "existing clients")} will be updated. Only the fields that have a value in the file are replaced; blank cells keep what Paidly has.</li>
                <li>{plural(summary.skip, "row", "rows")} will be skipped.</li>
                <li>{plural(summary.invalid, "row still needs", "rows still need")} a correction and will not be imported.</li>
              </ul>
              {[
                ["update", "Will update", plan.update, true],
                ["create", "Will create", plan.create, false],
                ["skip", "Will skip", plan.skip, false],
              ].map(([key, title, list, openByDefault]) =>
                list.length ? (
                  <details key={key} open={openByDefault} className="rounded-lg border px-3 py-2">
                    <summary className="cursor-pointer font-medium">{title} ({list.length})</summary>
                    <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                      {list.slice(0, 500).map((line) => <li key={line} className="break-words">{line}</li>)}
                      {list.length > 500 ? <li>…and {list.length - 500} more.</li> : null}
                    </ul>
                  </details>
                ) : null
              )}
              <p>This writes to the clients of the business you are signed in to. You can download a file of anything that fails and import it again.</p>
            </div>
          ) : null}

          {step === "importing" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Importing {progress.done} of {progress.total}</p>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              <p className="text-xs text-muted-foreground">Keep this open. If the connection drops, retry — clients already saved are not created again.</p>
            </div>
          ) : null}

          {step === "done" && results ? (
            <DoneState
              variant="dialog"
              tone={resultCounts.failed || resultCounts.remaining ? "pending" : "success"}
              title={
                resultCounts.created + resultCounts.replayed + resultCounts.updated
                  ? `${resultCounts.created + resultCounts.replayed} ${resultCounts.created + resultCounts.replayed === 1 ? "client" : "clients"} added${resultCounts.updated ? `, ${resultCounts.updated} updated` : ""}.`
                  : "No clients were changed."
              }
              message={
                <div className="space-y-2">
                  <p className="truncate">{file?.name}</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-left text-sm sm:grid-cols-3">
                    {[
                      ["Rows processed", results.length - resultCounts.remaining],
                      ["Created", resultCounts.created + resultCounts.replayed],
                      ["Updated", resultCounts.updated],
                      ["Skipped", resultCounts.skipped],
                      ["Duplicates skipped", resultCounts.duplicates],
                      ["Failed", resultCounts.failed],
                      ["Not processed", resultCounts.remaining],
                    ].map(([label, n]) => (
                      <div key={label} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-medium tabular-nums">{n}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              }
              status={
                resultCounts.failed || resultCounts.remaining
                  ? { label: "Still to fix", value: `${plural(resultCounts.failed + resultCounts.remaining, "row was", "rows were")} not imported`, tone: "pending" }
                  : { label: "Clients", value: "Available in your client list, invoices and quotes", tone: "success" }
              }
              pending={resultCounts.skipped ? `${plural(resultCounts.skipped, "row was", "rows were")} skipped. Download them to see why.` : null}
              actions={[
                { label: "Download imported", onClick: () => download("created"), icon: Download, disabled: !(resultCounts.created + resultCounts.replayed + resultCounts.updated) },
                { label: "Download skipped", onClick: () => download("skipped"), icon: Download, variant: "outline", disabled: !resultCounts.skipped },
                { label: "Download rows to fix", onClick: () => download("failed"), icon: Download, variant: "outline", disabled: !(resultCounts.failed + resultCounts.remaining) },
              ]}
              followUp={resultCounts.failed || resultCounts.remaining ? { label: "Retry rows that weren't imported", onClick: () => runImport(true) } : null}
            />
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {busy && step !== "upload" ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{busy}</p> : null}
        </div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
