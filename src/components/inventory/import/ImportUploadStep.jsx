import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, FileText, Loader2, RefreshCw, ScanText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { IMPORT_ACCEPT, formatFileSize } from "@/lib/productImport/fileDetect.js";
import { downloadCsvTemplate, downloadExcelTemplate } from "@/lib/productImport/importFiles.js";
import { IMPORT_LIMITS } from "@shared/catalog/productImport.js";

const EXAMPLE_FIELDS = "Product Name, SKU, Description, Category, Brand, Cost Price, Selling Price, VAT, Stock Quantity, Barcode, Unit";

function kindOf(file) {
  const ext = String(file?.name || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return { label: "PDF", Icon: FileText };
  if (ext === "csv") return { label: "CSV", Icon: FileSpreadsheet };
  return { label: "Excel", Icon: FileSpreadsheet };
}

/**
 * Pick / drop a file; shows what was chosen and the reading stage. Scanned PDFs get an OCR offer.
 */
export default function ImportUploadStep({
  itemType,
  onItemTypeChange,
  canImportProducts,
  onUpgrade,
  file,
  onFile,
  onRemoveFile,
  busy,
  error,
  scanned,
  onTryOcr,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const kind = file ? kindOf(file) : null;

  const pick = (f) => {
    if (f) onFile(f);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Upload an Excel, CSV or PDF product document and Paidly will extract the product information for you.
      </p>

      <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Import as">
        {[
          { key: "product", label: "Products (with stock)" },
          { key: "service", label: "Services" },
        ].map((opt) => (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={itemType === opt.key}
            disabled={Boolean(busy)}
            onClick={() => (opt.key === "product" && !canImportProducts ? onUpgrade() : onItemTypeChange(opt.key))}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              itemType === opt.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer?.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40 hover:bg-muted/30"
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Drop your file here, or choose a file</p>
          <p className="text-xs text-muted-foreground">
            Excel (.xlsx, .xls), CSV (.csv) or PDF (.pdf) · up to {Math.round(IMPORT_LIMITS.maxFileBytes / 1024 / 1024)} MB · up to{" "}
            {IMPORT_LIMITS.maxRows.toLocaleString()} rows
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            data-testid="product-import-file"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <kind.Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {kind.label} · {formatFileSize(file.size)}
              </p>
            </div>
            {!busy ? (
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                  <RefreshCw className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Replace</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onRemoveFile} aria-label="Remove file">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={IMPORT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {busy ? (
            <div className="space-y-1.5" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {busy.label}
              </div>
              <Progress value={busy.progress != null ? Math.round(busy.progress * 100) : 35} className={busy.progress == null ? "animate-pulse" : ""} />
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {scanned && !busy ? (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="flex items-start gap-2">
            <ScanText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              This PDF appears to be scanned/image-based, so it has no text to read directly. Paidly can try text recognition (OCR) on
              this device — it is slower and less accurate, and every row will need checking. An Excel/CSV file or a text-based PDF works
              best.
            </span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onTryOcr}>
            <ScanText className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Try reading with OCR
          </Button>
        </div>
      ) : null}

      <div className="rounded-xl bg-muted/40 p-4 text-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Templates</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={templateBusy}
            onClick={async () => {
              setTemplateBusy(true);
              try {
                await downloadExcelTemplate();
              } finally {
                setTemplateBusy(false);
              }
            }}
          >
            <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Download Excel template
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadCsvTemplate}>
            <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Download CSV template
          </Button>
        </div>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Fields Paidly looks for:</span> {EXAMPLE_FIELDS}. Column order doesn&apos;t matter
          and only the product name is required. PDF price lists and catalogues with a table work too.
        </p>
      </div>
    </div>
  );
}
