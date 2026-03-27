import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Camera, Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { UploadToReceipts, ExtractDataFromUploadedFile } from "@/api/integrations";
import { getReceiptExtractionSchema, parsedReceiptToExpenseForm } from "@/constants/receiptOcrExtractionSpec";
import { extractReceiptDataWithTesseract } from "@/utils/receiptTesseractOcr";
import {
    getReceiptScanThrottleState,
    recordReceiptScanAttempt,
} from "@/utils/receiptOcrRateLimit";
import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";

function formatRetryMinutes(ms) {
    return Math.max(1, Math.ceil(ms / 60000));
}

const IMAGE_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/bmp",
    "image/tiff",
];

/** Steps: 1 Upload Photo → 2 OCR Reads Receipt → 3 Confirm & Save (in form) */
const STEP_UPLOAD = 1;
const STEP_OCR_RESULT = 2;

/** After parsing, populate the expense form: vendor, amount, date + receipt_url, attachments, etc. */
function buildScanPayload(data, file_url, file) {
    const normalizeAmount = (value) => {
        if (value == null || value === "") return "";
        const n = Number.parseFloat(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : "";
    };
    const normalizeDate = (value) => {
        const s = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return new Date().toISOString().slice(0, 10);
    };
    const expense = parsedReceiptToExpenseForm(data, {
        receipt_url: file_url,
        attachments: [{ name: file.name, url: file_url }],
        is_claimable: true,
        payment_method: "bank_transfer",
        notes: "",
    });
    expense.amount = normalizeAmount(expense.amount);
    expense.date = normalizeDate(expense.date);
    expense.description = String(expense.description || "").trim() || "Receipt";
    return expense;
}

function StepIndicator({ currentStep }) {
    const steps = [
        { num: 1, label: "Upload Photo" },
        { num: 2, label: "OCR Reads Receipt" },
    ];
    return (
        <div className="flex items-center justify-center gap-2 mb-6">
            {steps.map(({ num, label }) => (
                <React.Fragment key={num}>
                    <div className="flex flex-col items-center">
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                                currentStep > num
                                    ? "bg-primary text-primary-foreground"
                                    : currentStep === num
                                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                                        : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {currentStep > num ? <CheckCircle2 className="w-4 h-4" /> : num}
                        </div>
                        <span className="mt-1 hidden text-xs text-muted-foreground sm:inline">{label}</span>
                    </div>
                    {num < steps.length && (
                        <div className={`h-0.5 w-6 sm:w-8 ${currentStep > num ? "bg-primary" : "bg-muted"}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

export default function ReceiptScanner({ onScanComplete, onCancel }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [useBrowserOcr, setUseBrowserOcr] = useState(false);
    const [result, setResult] = useState(null);

    const currentStep = result ? STEP_OCR_RESULT : loading ? STEP_OCR_RESULT : STEP_UPLOAD;

    const handleScan = async (file) => {
        if (!file) return;

        const isImage = IMAGE_TYPES.includes((file.type || "").toLowerCase());
        if (useBrowserOcr && !isImage) {
            setError("Browser OCR works with images (JPG, PNG). Use server extraction for PDFs.");
            return;
        }

        const throttle = getReceiptScanThrottleState();
        if (throttle.blocked) {
            setError(
                `Too many receipt scans in this tab. Try again in about ${formatRetryMinutes(throttle.retryAfterMs)} minute(s).`
            );
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        let file_url = null;
        try {
            recordReceiptScanAttempt();
            const uploadRes = await retryOnAbort(() => UploadToReceipts({ file }), 2, 450);
            file_url = uploadRes?.file_url || null;
            if (!file_url) throw new Error("Receipt upload failed");

            if (useBrowserOcr && isImage) {
                const data = await retryOnAbort(() => extractReceiptDataWithTesseract(file), 1, 350);
                const payload = buildScanPayload(data, file_url, file);
                setResult({
                    total: data.total != null ? String(data.total) : data.raw?.match(/total\s*R?\s*(\d+[.,]\d+)/i)?.[1] ?? null,
                    raw: data.raw || "",
                    payload,
                });
            } else {
                // Server extraction may not be configured in this app build (custom client).
                // Handle gracefully: if extraction fails or is unavailable, still attach the receipt and let user fill manually.
                let apiResult = null;
                try {
                    apiResult = await retryOnAbort(() => ExtractDataFromUploadedFile({
                        file_url,
                        json_schema: getReceiptExtractionSchema(),
                    }), 1, 350);
                } catch (e) {
                    apiResult = { status: "error", error: e?.message || String(e) };
                }

                // If server extraction isn't available, and this is an image, fall back to browser OCR automatically.
                let extracted = apiResult?.status === "success" && apiResult.output ? apiResult.output : null;
                let raw = "";
                if (!extracted && isImage) {
                    try {
                        const data = await retryOnAbort(() => extractReceiptDataWithTesseract(file), 1, 350);
                        extracted = data;
                        raw = data?.raw || "";
                    } catch (e) {
                        // ignore; we'll still return an attached receipt payload
                        if (import.meta.env.DEV) {
                            console.warn("[ReceiptScanner] Browser OCR fallback failed:", e?.message || e);
                        }
                    }
                }

                if (!extracted && apiResult?.error) {
                    setError(apiResult.error);
                }

                const payload = buildScanPayload(extracted, file_url, file);
                const total = payload?.amount != null ? String(payload.amount) : null;
                setResult({ total, raw, payload });
            }
        } catch (err) {
            console.error("Error scanning receipt:", err);
            const msg = err?.message || "Failed to scan receipt. Please try again.";
            if (isAbortError(err)) {
                // Mobile Safari / flaky networks may abort in-flight requests; preserve progress if upload succeeded.
                if (file_url) {
                    const payload = buildScanPayload(null, file_url, file);
                    setResult({ total: payload?.amount ? String(payload.amount) : null, raw: "", payload });
                    setError("Scan was interrupted, but the receipt was uploaded. Continue and fill details manually.");
                } else {
                    setError("The scan was interrupted on mobile/network. Please retry and keep the app open until upload completes.");
                }
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleContinueToForm = () => {
        if (result?.payload) onScanComplete(result.payload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl">
                <div className="flex items-center justify-between border-b border-border p-6">
                    <h2 className="text-xl font-semibold text-foreground">Scan Receipt</h2>
                    <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="p-6">
                    <StepIndicator currentStep={currentStep} />

                    {loading ? (
                        <div className="text-center py-10">
                            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                            <p className="font-medium text-foreground">OCR reads receipt</p>
                            <p className="mt-2 text-sm text-muted-foreground">Extracting vendor, amount, date…</p>
                        </div>
                    ) : result ? (
                        <div className="space-y-4">
                            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                                <p className="font-medium text-foreground">
                                    Expense form auto-filled
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Total: {result.total ?? "—"}
                                    {result.payload?.vendor && ` · ${result.payload.vendor}`}
                                </p>
                                {result.raw && (
                                    <details className="text-sm">
                                        <summary className="cursor-pointer text-muted-foreground">Raw OCR text</summary>
                                        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs text-foreground">{result.raw}</pre>
                                    </details>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setResult(null)}>
                                    Scan another
                                </Button>
                                <Button className="flex-1 gap-2" onClick={handleContinueToForm}>
                                    <FileText className="w-4 h-4" />
                                    Confirm & save
                                </Button>
                            </div>
                            <p className="text-center text-xs text-muted-foreground">
                                Next: review the expense form and save
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 py-8 text-center">
                                <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                                <p className="mb-1 font-medium text-foreground">Upload photo</p>
                                <p className="mb-4 text-sm text-muted-foreground">
                                    We&apos;ll read the receipt and fill the expense for you
                                </p>
                                <label htmlFor="receipt-upload">
                                    <Button asChild className="bg-primary hover:bg-primary/90">
                                        <span className="gap-2">
                                            <Camera className="w-4 h-4" />
                                            Choose photo or file
                                        </span>
                                    </Button>
                                    <input
                                        id="receipt-upload"
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleScan(file);
                                            e.target.value = "";
                                        }}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                                <Checkbox
                                    checked={useBrowserOcr}
                                    onCheckedChange={(checked) => setUseBrowserOcr(!!checked)}
                                />
                                <span>Extract with browser OCR (works offline, images only)</span>
                            </label>

                            {error && (
                                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                                    {error}
                                </div>
                            )}

                            <p className="text-center text-xs text-muted-foreground">
                                JPG, PNG, WebP, or PDF
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}