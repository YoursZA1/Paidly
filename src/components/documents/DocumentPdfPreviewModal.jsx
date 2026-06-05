import { useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Download,
  Send,
  PenLine,
  Printer,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import DocumentPdfTemplate from "./DocumentPdfTemplate";
import generatePdfFromElement from "@/utils/generatePdfFromElement";
import { typeLabel } from "@/document-engine";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200];
const DEFAULT_ZOOM = 100;

/**
 * PDF preview modal — scrollable, zoomable document preview with Print / Download /
 * Send to Client / Send for Signature controls in the toolbar.
 */
export default function DocumentPdfPreviewModal({
  open,
  onOpenChange,
  doc,
  workspace,
  client,
  onSendToClient,
  onSendForSignature,
}) {
  const { toast } = useToast();
  const templateRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const filename = [
    doc?.document_number || typeLabel(doc?.type) || "document",
    ".pdf",
  ]
    .join("")
    .replace(/\s+/g, "-");

  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const next = ZOOM_STEPS.find((s) => s > z);
      return next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = [...ZOOM_STEPS].reverse().find((s) => s < z);
      return next ?? ZOOM_STEPS[0];
    });
  }, []);

  const zoomReset = useCallback(() => setZoom(DEFAULT_ZOOM), []);

  const handleDownload = useCallback(async () => {
    if (!templateRef.current) return;
    setDownloading(true);
    try {
      await generatePdfFromElement(templateRef.current, filename);
      toast({ title: "PDF downloaded" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: e?.message || String(e),
      });
    } finally {
      setDownloading(false);
    }
  }, [filename, toast]);

  const handlePrint = useCallback(() => {
    if (!templateRef.current) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast({
        variant: "destructive",
        title: "Print blocked",
        description: "Allow pop-ups for this site to use print.",
      });
      return;
    }
    const html = templateRef.current.outerHTML;
    win.document.write(
      `<!DOCTYPE html><html><head><title>${filename}</title>` +
        `<style>` +
        `body{margin:0;padding:0;}` +
        `@page{margin:15mm 18mm;}` +
        `@media print{body{margin:0;} .no-print{display:none;}}` +
        `</style></head><body>${html}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
  }, [filename, toast]);

  const handleSend = useCallback(() => {
    onOpenChange(false);
    onSendToClient?.();
  }, [onOpenChange, onSendToClient]);

  const handleSign = useCallback(() => {
    onOpenChange(false);
    onSendForSignature?.();
  }, [onOpenChange, onSendForSignature]);

  const atMinZoom = zoom <= ZOOM_STEPS[0];
  const atMaxZoom = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] w-full max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* ── Toolbar ── */}
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Title */}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-semibold leading-none">
                PDF Preview
              </DialogTitle>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {doc?.title || typeLabel(doc?.type) || "Document"}
                {doc?.document_number ? ` · #${doc.document_number}` : ""}
              </p>
            </div>

            {/* Zoom controls — centre */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 px-1 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={zoomOut}
                disabled={atMinZoom}
                title="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <button
                type="button"
                className="min-w-[52px] text-center text-xs font-medium tabular-nums text-foreground"
                onClick={zoomReset}
                title="Reset to 100%"
              >
                {zoom}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={zoomIn}
                disabled={atMaxZoom}
                title="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handlePrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download PDF
              </Button>
              {onSendToClient && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSend}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send to Client
                </Button>
              )}
              {onSendForSignature && (
                <Button size="sm" className="gap-1.5" onClick={handleSign}>
                  <PenLine className="h-3.5 w-3.5" />
                  Send for Signature
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ── Preview pane ── */}
        <div className="flex-1 overflow-auto bg-neutral-200/60 p-8">
          {/* Zoom wrapper — scale from top-center so the document stays aligned */}
          <div
            style={{
              transformOrigin: "top center",
              transform: `scale(${zoom / 100})`,
              transition: "transform 0.15s ease",
              /* Keep outer container large enough so the scrollbar matches content */
              height: zoom !== DEFAULT_ZOOM
                ? `${zoom}%`
                : undefined,
            }}
          >
            <div className="mx-auto max-w-3xl overflow-hidden rounded-xl shadow-2xl ring-1 ring-black/10">
              <DocumentPdfTemplate
                ref={templateRef}
                doc={doc}
                workspace={workspace}
                client={client}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
