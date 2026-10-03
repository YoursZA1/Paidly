import { useCallback, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Camera,
  Check,
  Circle,
  FileWarning,
  Loader2,
  PencilLine,
  ScanLine,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import { useUpgradeModalStore } from "@/stores/useUpgradeModalStore";
import ReceiptCamera from "@/components/cashflow/receipt/ReceiptCamera";
import ReceiptReviewForm from "@/components/cashflow/receipt/ReceiptReviewForm";
import { STEPS, useReceiptScan } from "@/components/cashflow/receipt/useReceiptScan";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const STEP_LABELS = {
  uploading: "Uploading",
  processing: "Processing receipt",
  reading: "Reading receipt",
  checking: "Checking details",
};

function useCoarsePointer() {
  const [coarse] = useState(() => {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  });
  return coarse;
}

function ChooseSource({ onFile, onCamera, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const coarse = useCoarsePointer();
  const cameraSupported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  const scanButton = (
    <Button type="button" size="lg" className="min-h-14 w-full gap-2 text-base" onClick={onCamera} variant={coarse ? "default" : "outline"}>
      <Camera className="h-5 w-5" aria-hidden="true" />
      Scan receipt
    </Button>
  );
  const uploadButton = (
    <Button
      type="button"
      size="lg"
      className="min-h-14 w-full gap-2 text-base"
      variant={coarse ? "outline" : "default"}
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="h-5 w-5" aria-hidden="true" />
      Upload receipt
    </Button>
  );

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file, "upload");
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30"
        }`}
      >
        <ScanLine className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
        <p className="font-medium text-foreground">Add a receipt and Paidly fills in the expense</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;ll check the details before anything is saved.
          <span className="hidden sm:inline"> You can also drop a file here.</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {coarse ? (
          <>
            {cameraSupported ? scanButton : null}
            {uploadButton}
          </>
        ) : (
          <>
            {uploadButton}
            {cameraSupported ? scanButton : null}
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file, "upload");
        }}
      />
      <p className="text-center text-xs text-muted-foreground">JPG, PNG, WEBP or PDF · up to 10 MB</p>
      {error ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Processing({ steps, readProgress, preview }) {
  const current = STEPS.find((s) => steps[s] === "active") || STEPS.find((s) => !steps[s]) || "checking";
  return (
    <div className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:items-start">
      {preview ? (
        <img src={preview} alt="" className="h-40 w-32 shrink-0 rounded-lg border border-border object-cover opacity-80 sm:h-48 sm:w-36" />
      ) : null}
      <div className="w-full space-y-4">
        <p className="sr-only" role="status" aria-live="polite">
          {STEP_LABELS[current]}…
        </p>
        <ol className="space-y-3" aria-label="Progress">
          {STEPS.map((step) => {
            const status = steps[step] || "pending";
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  {status === "done" ? (
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  ) : status === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                  ) : status === "error" ? (
                    <X className="h-4 w-4 text-destructive" aria-hidden="true" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className={status === "pending" ? "text-muted-foreground" : "font-medium text-foreground"}>
                  {STEP_LABELS[step]}
                  {step === "reading" && status === "active" && readProgress > 0 ? ` · ${Math.round(readProgress * 100)}%` : ""}
                  <span className="sr-only">
                    {status === "done" ? " (done)" : status === "active" ? " (in progress)" : status === "error" ? " (failed)" : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-muted-foreground">You can keep using Paidly — this takes a few seconds.</p>
      </div>
    </div>
  );
}

function Failure({ failure, uploaded, onRetry, onManual, onRetake, onUploadAnother, onUpgrade, onClose }) {
  const presets = {
    invalid_file: { icon: FileWarning, title: "This file can't be used" },
    upload: { icon: AlertTriangle, title: "We couldn't upload this receipt." },
    network: { icon: WifiOff, title: "Connection problem" },
    unreadable: { icon: FileWarning, title: "We couldn't read this receipt clearly." },
    not_receipt: { icon: FileWarning, title: "This image doesn't appear to contain a readable receipt." },
    upgrade: { icon: AlertTriangle, title: "Upgrade to add expenses" },
    forbidden: { icon: AlertTriangle, title: "You can't add this expense" },
  };
  const pdf = failure.fileKind === "pdf";
  if (pdf) presets.unreadable = { icon: FileWarning, title: "We couldn't read this PDF." };
  const preset = presets[failure.kind] || presets.unreadable;
  const Icon = preset.icon;
  let body = failure.message;
  if (failure.kind === "unreadable") body = "You can enter the details manually — the receipt stays attached.";
  if (failure.kind === "not_receipt") body = "Make sure the whole receipt is in the photo, in good light.";
  if (failure.kind === "upload") body = "Check your connection and try again.";

  const actions = [];
  if (failure.kind === "upload" || failure.kind === "network") actions.push({ label: "Try again", onClick: onRetry, primary: true });
  if ((failure.kind === "unreadable" || failure.kind === "network") && uploaded) {
    actions.push({ label: "Enter manually", onClick: onManual, primary: failure.kind === "unreadable", icon: PencilLine });
  }
  if (failure.kind === "not_receipt" || failure.kind === "invalid_file" || failure.kind === "unreadable") {
    actions.push({ label: "Retake", onClick: onRetake, primary: failure.kind !== "unreadable", icon: Camera });
    actions.push({ label: "Upload another", onClick: onUploadAnother, icon: Upload });
  }
  if (failure.kind === "upgrade") actions.push({ label: "See plans", onClick: onUpgrade, primary: true });
  if (failure.kind === "forbidden") actions.push({ label: "Close", onClick: onClose, primary: true });

  return (
    <div className="space-y-5 py-2 text-center" role="alert">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
        <Icon className="h-6 w-6 text-amber-600" aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">{preset.title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {actions.map((a) => {
          const ActionIcon = a.icon;
          return (
            <Button key={a.label} type="button" variant={a.primary ? "default" : "outline"} className="min-h-12 gap-2" onClick={a.onClick}>
              {ActionIcon ? <ActionIcon className="h-4 w-4" aria-hidden="true" /> : null}
              {a.label}
            </Button>
          );
        })}
      </div>
      {(failure.kind === "unreadable" && !pdf) || failure.kind === "not_receipt" ? (
        <div className="mx-auto max-w-sm rounded-lg bg-muted/50 px-4 py-3 text-left text-sm text-muted-foreground">
          <p className="font-medium text-foreground">For a clearer photo:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>use good light, without glare</li>
            <li>lay the receipt flat</li>
            <li>keep all four edges in the photo</li>
            <li>move close enough to read the small print</li>
          </ul>
        </div>
      ) : null}
      {failure.kind === "not_receipt" && uploaded ? (
        <button type="button" onClick={onManual} className="text-sm text-primary underline-offset-2 hover:underline">
          It is a receipt — enter the details myself
        </button>
      ) : null}
    </div>
  );
}

/**
 * Scan Receipt: photo/upload → Paidly reads it → review → Save expense. The expense is created only on Save.
 *
 * @param {{
 *   onCancel: () => void,
 *   onExpenseCreated?: (expense: any) => void,
 *   onViewExpense?: (expenseOrId: any) => void,
 * }} props
 */
export default function ReceiptScanner({ onCancel, onExpenseCreated, onViewExpense }) {
  const scan = useReceiptScan({ onExpenseCreated });
  const { state } = scan;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [chooseError, setChooseError] = useState("");
  const openUpgradeModal = useUpgradeModalStore((s) => s.openUpgradeModal);
  const formId = "receipt-review-form";
  const cameraFallbackRef = useRef(null);

  const hasUnsavedReceipt = Boolean(state.receiptPath) && state.phase !== "done";

  const close = useCallback(() => {
    scan.abandon();
    onCancel();
  }, [onCancel, scan]);

  const requestClose = useCallback(() => {
    if (state.phase === "review" && hasUnsavedReceipt) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }, [close, hasUnsavedReceipt, state.phase]);

  const onFile = useCallback(
    (file, source) => {
      setChooseError("");
      void scan.start(file, { source });
    },
    [scan]
  );

  const wide = state.phase === "review";
  const title =
    state.phase === "review" ? "Review receipt" : state.phase === "done" ? "Expense added" : state.phase === "camera" ? "Scan receipt" : "Scan Receipt";

  const saved = state.savedExpense;
  const savedDate = (() => {
    try {
      return saved?.date ? format(parseISO(saved.date), "d MMM yyyy") : "";
    } catch {
      return saved?.date || "";
    }
  })();

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => (!open ? requestClose() : null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => e.preventDefault()}
          className={`fixed inset-0 z-[120] flex flex-col bg-card text-card-foreground shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[92vh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border ${
            wide ? "sm:max-w-5xl" : "sm:max-w-lg"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
            <DialogPrimitive.Title className="text-lg font-semibold text-foreground">{title}</DialogPrimitive.Title>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={requestClose} aria-label="Close">
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            {confirmDiscard ? (
              <div className="space-y-4 py-6 text-center" role="alertdialog" aria-labelledby="receipt-discard-title">
                <p id="receipt-discard-title" className="text-base font-semibold text-foreground">
                  Discard this receipt?
                </p>
                <p className="text-sm text-muted-foreground">The expense hasn&apos;t been saved. The uploaded receipt will be removed.</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button type="button" className="min-h-12" onClick={() => setConfirmDiscard(false)} autoFocus>
                    Keep reviewing
                  </Button>
                  <Button type="button" variant="outline" className="min-h-12" onClick={close}>
                    Discard
                  </Button>
                </div>
              </div>
            ) : state.phase === "choose" ? (
              <ChooseSource onFile={onFile} onCamera={scan.openCamera} error={chooseError} />
            ) : state.phase === "camera" ? (
              <ReceiptCamera onCapture={(file) => onFile(file, "camera")} onCancel={scan.closeCamera} />
            ) : state.phase === "processing" ? (
              <Processing steps={state.steps} readProgress={state.readProgress} preview={state.receipt?.kind === "image" ? state.receipt?.previewUrl : null} />
            ) : state.phase === "failed" && state.failure ? (
              state.failure.stage === "inspect" ? (
                <ChooseSource onFile={onFile} onCamera={scan.openCamera} error={chooseError || state.failure.message} />
              ) : (
                <Failure
                  failure={state.failure}
                  uploaded={Boolean(state.receipt?.uploaded)}
                  onRetry={scan.retry}
                  onManual={scan.enterManually}
                  onRetake={() => {
                    scan.reset();
                    scan.openCamera();
                  }}
                  onUploadAnother={() => {
                    scan.reset();
                    setTimeout(() => cameraFallbackRef.current?.click(), 0);
                  }}
                  onUpgrade={() => {
                    close();
                    openUpgradeModal({ featureKey: "expenses" });
                  }}
                  onClose={close}
                />
              )
            ) : state.phase === "review" ? (
              <ReceiptReviewForm
                formId={formId}
                receipt={state.receipt}
                extraction={state.extraction}
                source={state.extractionSource}
                reviewInfo={state.reviewInfo}
                saving={state.saving}
                saveError={state.saveError}
                onSave={scan.save}
                onViewExpense={
                  onViewExpense
                    ? (id) => {
                        close();
                        onViewExpense(id);
                      }
                    : undefined
                }
              />
            ) : state.phase === "done" && saved ? (
              <DoneState
                variant="dialog"
                title="Expense added"
                reference={{
                  counterparty: saved.vendor || saved.description,
                  amount: formatCurrency(Number(saved.amount), "ZAR"),
                  meta: savedDate,
                }}
                message="Receipt attached successfully."
                status={{
                  label: "Status",
                  value: saved.is_claimable ? "Awaiting reimbursement approval" : "Recorded in Cash Flow",
                  tone: saved.is_claimable ? "pending" : "success",
                }}
                actions={[
                  ...(onViewExpense
                    ? [
                        {
                          label: "View expense",
                          onClick: () => {
                            onCancel();
                            onViewExpense(saved);
                          },
                        },
                      ]
                    : []),
                  { label: "Scan another receipt", icon: ScanLine, onClick: scan.scanAnother },
                ]}
              />
            ) : null}
            <input
              ref={cameraFallbackRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onFile(file, "upload");
              }}
            />
          </div>

          {state.phase === "review" && !confirmDiscard ? (
            <div className="flex shrink-0 gap-3 border-t border-border bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
              <Button type="button" variant="outline" className="min-h-12 flex-1 sm:flex-none" onClick={requestClose} disabled={state.saving}>
                Cancel
              </Button>
              <Button type="submit" form={formId} className="min-h-12 flex-1 gap-2 sm:ml-auto sm:min-w-44 sm:flex-none" disabled={state.saving}>
                {state.saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {state.saving ? "Saving…" : "Save expense"}
              </Button>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
