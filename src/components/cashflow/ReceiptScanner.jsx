import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Camera, Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { UploadToReceipts, ExtractDataFromUploadedFile } from "@/api/integrations";
import { getReceiptExtractionSchema, parsedReceiptToExpenseForm } from "@/constants/receiptOcrExtractionSpec";
import { extractReceiptDataWithTesseract } from "@/utils/receiptTesseractOcr";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Steps: 1 Upload Photo → 2 OCR Reads Receipt → 3 Confirm & Save (in form) */
const STEP_UPLOAD = 1;
const STEP_OCR_RESULT = 2;

/** After parsing, populate the expense form: vendor, amount, date + receipt_url, attachments, etc. */
function buildScanPayload(data, file_url, file) {
    const expense = parsedReceiptToExpenseForm(data, {
        receipt_url: file_url,
        attachments: [{ name: file.name, url: file_url }],
        is_claimable: true,
        payment_method: "bank_transfer",
        notes: "",
    });
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
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                currentStep > num
                                    ? "bg-primary text-primary-foreground"
                                    : currentStep === num
                                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                                        : "bg-slate-200 text-slate-500"
                            }`}
                        >
                            {currentStep > num ? <CheckCircle2 className="w-4 h-4" /> : num}
                        </div>
                        <span className="text-xs text-slate-500 mt-1 hidden sm:inline">{label}</span>
                    </div>
                    {num < steps.length && (
                        <div className={`w-6 h-0.5 sm:w-8 ${currentStep > num ? "bg-primary" : "bg-slate-200"}`} />
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

        const isImage = IMAGE_TYPES.includes(file.type);
        if (useBrowserOcr && !isImage) {
            setError("Browser OCR works with images (JPG, PNG). Use server extraction for PDFs.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const { file_url } = await UploadToReceipts({ file });

            if (useBrowserOcr && isImage) {
                const data = await extractReceiptDataWithTesseract(file);
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
                    apiResult = await ExtractDataFromUploadedFile({
                        file_url,
                        json_schema: getReceiptExtractionSchema(),
                    });
                } catch (e) {
                    apiResult = { status: "error", error: e?.message || String(e) };
                }

                // If server extraction isn't available, and this is an image, fall back to browser OCR automatically.
                let extracted = apiResult?.status === "success" && apiResult.output ? apiResult.output : null;
                let raw = "";
                if (!extracted && isImage) {
                    try {
                        const data = await extractReceiptDataWithTesseract(file);
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
            setError(err?.message || "Failed to scan receipt. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleContinueToForm = () => {
        if (result?.payload) onScanComplete(result.payload);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
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
                            <p className="text-slate-600 dark:text-slate-400 font-medium">OCR reads receipt</p>
                            <p className="text-sm text-slate-500 mt-2">Extracting vendor, amount, date…</p>
                        </div>
                    ) : result ? (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-2">
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                    Expense form auto-filled
                                </p>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Total: {result.total ?? "—"}
                                    {result.payload?.vendor && ` · ${result.payload.vendor}`}
                                </p>
                                {result.raw && (
                                    <details className="text-sm">
                                        <summary className="cursor-pointer text-slate-600 dark:text-slate-400">Raw OCR text</summary>
                                        <pre className="mt-2 p-2 bg-white dark:bg-slate-800 rounded border text-xs overflow-auto max-h-32 whitespace-pre-wrap">{result.raw}</pre>
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
                            <p className="text-xs text-slate-500 text-center">
                                Next: review the expense form and save
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50/50 dark:bg-slate-800/30">
                                <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                <p className="text-slate-700 dark:text-slate-300 font-medium mb-1">Upload photo</p>
                                <p className="text-sm text-slate-500 mb-4">
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

                            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                                <Checkbox
                                    checked={useBrowserOcr}
                                    onCheckedChange={(checked) => setUseBrowserOcr(!!checked)}
                                />
                                <span>Extract with browser OCR (works offline, images only)</span>
                            </label>

                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <p className="text-xs text-slate-500 text-center">
                                JPG, PNG, WebP, or PDF
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}