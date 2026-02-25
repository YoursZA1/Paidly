import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Camera, Upload, Loader2 } from "lucide-react";
import { UploadToActivities } from "@/api/integrations";

export default function ReceiptScanner({ onScanComplete, onCancel }) {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        setError(null);

        try {
            const { file_url } = await UploadToActivities({ file });

            // Extract data from the receipt (if you have this API)
            // const result = await breakApi.integrations.Core.ExtractDataFromUploadedFile({
            //     file_url: file_url,
            //     json_schema: { ... }
            // });
            // if (result.status === "success" && result.output) {
            //     onScanComplete({
            //         ...result.output,
            //         receipt_url: file_url,
            //         is_claimable: true
            //     });
            // } else {
            //     setError("Could not extract data from receipt. Please try again or enter manually.");
            // }
        } catch (err) {
            console.error("Error scanning receipt:", err);
            setError("Failed to scan receipt. Please try again.");
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
                <div className="flex justify-between items-center p-6 border-b">
                    <h2 className="text-xl font-semibold">Scan Receipt</h2>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="p-6">
                    {isScanning ? (
                        <div className="text-center py-12">
                            <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
                            <p className="text-slate-600">Scanning receipt...</p>
                            <p className="text-sm text-slate-500 mt-2">This may take a few seconds</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                                <Camera className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                <p className="text-slate-600 mb-2">Upload a receipt image</p>
                                <p className="text-sm text-slate-500 mb-4">
                                    We'll extract the details automatically
                                </p>
                                <label htmlFor="receipt-upload">
                                    <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
                                        <span>
                                            <Upload className="w-4 h-4 mr-2" />
                                            Choose File
                                        </span>
                                    </Button>
                                    <input
                                        id="receipt-upload"
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <p className="text-xs text-slate-500 text-center">
                                Supports JPG, PNG, and PDF files
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}