import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ExternalLink, ScanLine, Paperclip, Upload, Loader2, Sparkles, MapPin, Car } from "lucide-react";
import { format } from "date-fns";
import { Vendor } from "@/api/entities";
import { UploadToActivities, UploadToReceipts, ExtractDataFromUploadedFile, InvokeLLM } from "@/api/integrations";
import { getReceiptExtractionSchema, parsedReceiptToExpenseForm } from "@/constants/receiptOcrExtractionSpec";
import { extractReceiptDataWithTesseract } from "@/utils/receiptTesseractOcr";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function ExpenseForm({ expense, onSave, onCancel, fromReceiptScan }) {
    const { toast } = useToast();
    const baseFormState = {
        category: "office",
        description: "",
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        payment_method: "bank_transfer",
        vendor: "",
        vendor_id: "",
        receipt_url: "",
        attachments: [],
        is_claimable: true,
        notes: "",
        vat: "",
        currency: "ZAR",
        is_mileage: false,
        distance: "",
        distance_unit: "km",
        rate_per_unit: 4.84, // Default SARS rate approx
        start_location: "",
        end_location: ""
    };
    const [formData, setFormData] = useState({ ...baseFormState, ...(expense || {}) });

    const [vendors, setVendors] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [useBrowserOcr, setUseBrowserOcr] = useState(false);
    const [activeTab, setActiveTab] = useState(expense?.is_mileage ? "mileage" : "general");

    const isImageFile = (file) => /^image\/(jpeg|jpg|png|webp|gif|bmp|heic|heif|tiff?)$/i.test(file?.type);

    const parseMoney = (value) => {
        if (value == null || value === "") return null;
        const normalized = String(value).replace(/[^\d.,-]/g, "").replace(",", ".");
        const n = Number.parseFloat(normalized);
        return Number.isFinite(n) ? n : null;
    };

    const normalizeDateInput = (value) => {
        if (!value) return format(new Date(), "yyyy-MM-dd");
        const s = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return format(d, "yyyy-MM-dd");
        return format(new Date(), "yyyy-MM-dd");
    };

    useEffect(() => {
        loadVendors();
        if (expense?.receipt_url && (!expense.attachments || expense.attachments.length === 0)) {
            // Migration for legacy single receipt
            setFormData(prev => ({
                ...prev,
                attachments: [{ name: "Receipt", url: expense.receipt_url }]
            }));
        }
    }, []);

    useEffect(() => {
        if (!expense) return;
        setFormData((prev) => ({
            ...baseFormState,
            ...prev,
            ...expense,
            date: normalizeDateInput(expense.date),
            amount: expense.amount ?? "",
            attachments: Array.isArray(expense.attachments) ? expense.attachments : prev.attachments || [],
        }));
    }, [expense]);

    // Recalculate amount if mileage changes
    useEffect(() => {
        if (activeTab === "mileage" && formData.distance && formData.rate_per_unit) {
            const calculated = parseFloat(formData.distance) * parseFloat(formData.rate_per_unit);
            setFormData(prev => ({ ...prev, amount: calculated.toFixed(2) }));
        }
    }, [formData.distance, formData.rate_per_unit, activeTab]);

    const loadVendors = async () => {
        try {
            const data = await Vendor.list("-name");
            setVendors(data);
        } catch (error) {
            console.error("Error loading vendors", error);
            toast({
                title: "Could not load vendors",
                description: error?.message || "Please try again later.",
                variant: "destructive",
            });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const parsedAmount = parseMoney(formData.amount);
        if (!(parsedAmount > 0)) {
            toast({
                title: "Amount required",
                description: "Enter a valid amount greater than zero before saving.",
                variant: "destructive",
            });
            return;
        }
        if (!String(formData.description || "").trim()) {
            toast({
                title: "Description required",
                description: "Add a short description for this expense.",
                variant: "destructive",
            });
            return;
        }
        
        const dataToSave = {
            ...formData,
            amount: parsedAmount,
            is_mileage: activeTab === "mileage",
            // Flatten legacy receipt_url if attachments exist
            receipt_url: formData.attachments?.[0]?.url || formData.receipt_url || ""
        };
        
        if (!expense && !formData.expense_number) {
            dataToSave.expense_number = `EXP-${Date.now()}`;
        }
        
        onSave(dataToSave);
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newAttachments = [...(formData.attachments || [])];

        for (const file of files) {
            try {
                const { file_url } = await UploadToActivities({ file });
                newAttachments.push({ name: file.name, url: file_url });
            } catch (error) {
                console.error("File upload failed", error);
                toast({
                    title: "Upload failed",
                    description: error?.message || "Could not upload file. Try again.",
                    variant: "destructive",
                });
            }
        }

        setFormData(prev => ({ ...prev, attachments: newAttachments }));
    };

    const handleScanReceipt = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const useOcr = useBrowserOcr && isImageFile(file);
        if (useBrowserOcr && !isImageFile(file)) {
            toast({
                title: "Browser OCR works with images only",
                description: "Use JPG or PNG for browser OCR, or turn off to use server extraction for PDFs.",
                variant: "destructive"
            });
            return;
        }

        setIsScanning(true);
        try {
            const { file_url } = await UploadToReceipts({ file });
            const newAttachments = [...(formData.attachments || []), { name: file.name, url: file_url }];

            let data = null;
            if (useOcr) {
                data = await extractReceiptDataWithTesseract(file);
            } else {
                let result = null;
                try {
                    result = await ExtractDataFromUploadedFile({
                        file_url,
                        json_schema: getReceiptExtractionSchema()
                    });
                } catch (err) {
                    if (import.meta.env.DEV) console.warn("[ExpenseForm] Server extraction failed:", err?.message || err);
                }
                if (result?.status === "success" && result.output) data = result.output;
                // Professional fallback: if server extraction is unavailable, automatically try browser OCR for images.
                if (!data && isImageFile(file)) {
                    data = await extractReceiptDataWithTesseract(file);
                }
            }

            if (data) {
                // Auto-fill expense form after parsing: vendor, amount, date (+ vat, currency, category, description)
                const filled = parsedReceiptToExpenseForm(data);
                const normalizedAmount = parseMoney(filled.amount);
                const normalizedDate = normalizeDateInput(filled.date);
                setFormData(prev => ({
                    ...prev,
                    vendor: filled.vendor || prev.vendor,
                    amount: normalizedAmount != null ? String(normalizedAmount) : prev.amount,
                    date: normalizedDate,
                    vat: filled.vat,
                    currency: filled.currency || prev.currency || "ZAR",
                    category: filled.category || prev.category || "office",
                    description: filled.description || prev.description || "Receipt",
                    attachments: newAttachments,
                    vendor_id: vendors.find(v => v.name.toLowerCase() === (data.vendor_name || "").toLowerCase())?.id ?? prev.vendor_id,
                }));
                toast({ title: "Receipt scanned", description: useOcr ? "Data extracted with browser OCR." : "Data extracted.", variant: "default" });
            } else {
                setFormData(prev => ({ ...prev, attachments: newAttachments }));
                toast({ title: "Receipt attached", description: "Could not extract data. Please fill in manually.", variant: "default" });
            }
        } catch (error) {
            console.error("Scanning failed", error);
            toast({
                title: "Scan failed",
                description: error?.message || "Failed to scan receipt. Try again or enter manually.",
                variant: "destructive"
            });
        }
        setIsScanning(false);
        e.target.value = "";
    };

    const suggestCategory = async () => {
        if (!formData.description && !formData.vendor) return;
        setIsSuggesting(true);
        try {
            const prompt = `Suggest a category for an expense based on this description: "${formData.description}" and vendor: "${formData.vendor}". 
            Categories: office, travel, utilities, supplies, salary, marketing, software, consulting, legal, maintenance, vehicle, meals, other.
            Return ONLY the category name.`;
            
            const category = await InvokeLLM({ prompt });
            if (category) {
                const cleanCat = category.trim().toLowerCase().replace(/['"]/g, '');
                // Verify it exists in our list
                const validCategories = ["office", "travel", "utilities", "supplies", "salary", "marketing", "software", "consulting", "legal", "maintenance", "vehicle", "meals", "other"];
                if (validCategories.includes(cleanCat)) {
                    setFormData(prev => ({ ...prev, category: cleanCat }));
                }
            }
        } catch (error) {
            console.error("AI suggestion failed", error);
            toast({
                title: "Suggestion failed",
                description: error?.message || "Could not suggest category. Choose manually.",
                variant: "destructive",
            });
        }
        setIsSuggesting(false);
    };

    const removeAttachment = (index) => {
        const newAttachments = [...formData.attachments];
        newAttachments.splice(index, 1);
        setFormData(prev => ({ ...prev, attachments: newAttachments }));
    };

    /** Portals to document.body so stacking sits above MobileBottomNav (z-50) inside Layout. */
    const modal = (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-1 sm:items-center sm:p-4">
            <div className="flex max-h-[calc(100dvh-0.25rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl sm:max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-border p-4 shrink-0 sm:p-6">
                    <div>
                        <h2 className="text-xl font-semibold text-primary">
                            {fromReceiptScan ? "Confirm & save" : expense?.id ? "Edit Expense" : "Add New Expense"}
                        </h2>
                        {fromReceiptScan && (
                            <p className="text-sm text-muted-foreground mt-1">Review the details below and save your expense</p>
                        )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
                    <form onSubmit={handleSubmit} className="space-y-6 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6">
                                <TabsTrigger value="general">General Expense</TabsTrigger>
                                <TabsTrigger value="mileage">Mileage Tracking</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-4">
                                {/* Scan Button: default server extraction; optional browser OCR */}
                                <div className="space-y-2 mb-4">
                                    <div className="relative flex justify-center">
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            onChange={handleScanReceipt}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={isScanning}
                                        />
                                        <Button type="button" variant="outline" className="border-dashed border-2 w-full" disabled={isScanning}>
                                            {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanLine className="w-4 h-4 mr-2 text-primary" />}
                                            {isScanning ? "Scanning Receipt..." : "Scan Receipt with AI"}
                                        </Button>
                                    </div>
                                    <label className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground">
                                        <Checkbox
                                            checked={useBrowserOcr}
                                            onCheckedChange={(checked) => setUseBrowserOcr(!!checked)}
                                        />
                                        <span>Extract with browser OCR (works offline, images only)</span>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>Vendor</Label>
                                        <div className="space-y-2">
                                            <Select 
                                                value={formData.vendor_id} 
                                                onValueChange={(val) => {
                                                    const vendor = vendors.find(v => v.id === val);
                                                    setFormData({
                                                        ...formData, 
                                                        vendor_id: val, 
                                                        vendor: vendor ? vendor.name : formData.vendor,
                                                        category: vendor?.default_category || formData.category
                                                    });
                                                }}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Vendor" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">-- Other / New --</SelectItem>
                                                    {vendors.map(v => (
                                                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {!formData.vendor_id || formData.vendor_id === "none" ? (
                                                <Input 
                                                    placeholder="Or enter vendor name" 
                                                    value={formData.vendor} 
                                                    onChange={(e) => setFormData({...formData, vendor: e.target.value})}
                                                />
                                            ) : null}
                                        </div>
                                    </div>

                                    <div>
                                        <Label>Amount (ZAR) *</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.amount}
                                            onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <Label>Description *</Label>
                                        <button 
                                            type="button" 
                                            onClick={suggestCategory}
                                            disabled={isSuggesting || !formData.description}
                                            className="text-xs text-primary flex items-center hover:underline disabled:opacity-50"
                                        >
                                            {isSuggesting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                                            Suggest Category
                                        </button>
                                    </div>
                                    <Input
                                        value={formData.description}
                                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                                        required
                                        onBlur={() => { if(formData.description && !formData.category) suggestCategory(); }}
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>Category *</Label>
                                        <Select 
                                            value={formData.category} 
                                            onValueChange={(value) => setFormData({...formData, category: value})}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="office">Office</SelectItem>
                                                <SelectItem value="travel">Travel</SelectItem>
                                                <SelectItem value="utilities">Utilities</SelectItem>
                                                <SelectItem value="supplies">Supplies</SelectItem>
                                                <SelectItem value="salary">Salary</SelectItem>
                                                <SelectItem value="marketing">Marketing</SelectItem>
                                                <SelectItem value="software">Software</SelectItem>
                                                <SelectItem value="consulting">Consulting</SelectItem>
                                                <SelectItem value="legal">Legal</SelectItem>
                                                <SelectItem value="maintenance">Maintenance</SelectItem>
                                                <SelectItem value="vehicle">Vehicle</SelectItem>
                                                <SelectItem value="meals">Meals</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Payment Method</Label>
                                        <Select 
                                            value={formData.payment_method} 
                                            onValueChange={(value) => setFormData({...formData, payment_method: value})}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">Cash</SelectItem>
                                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                                <SelectItem value="credit_card">Credit Card</SelectItem>
                                                <SelectItem value="debit_card">Debit Card</SelectItem>
                                                <SelectItem value="eft">EFT</SelectItem>
                                                <SelectItem value="check">Check</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="mileage" className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>Date *</Label>
                                        <Input
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({...formData, date: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label>Vehicle / Mode</Label>
                                        <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-muted-foreground">
                                            <Car className="w-4 h-4 mr-2" />
                                            Personal Vehicle
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <Label>Distance</Label>
                                        <div className="flex">
                                            <Input
                                                type="number"
                                                value={formData.distance}
                                                onChange={(e) => setFormData({...formData, distance: e.target.value})}
                                                placeholder="0"
                                                required={activeTab === 'mileage'}
                                            />
                                            <Select 
                                                value={formData.distance_unit} 
                                                onValueChange={(val) => setFormData({...formData, distance_unit: val})}
                                            >
                                                <SelectTrigger className="w-20 ml-2">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="km">km</SelectItem>
                                                    <SelectItem value="mi">mi</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Rate per {formData.distance_unit}</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={formData.rate_per_unit}
                                            onChange={(e) => setFormData({...formData, rate_per_unit: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <Label>Total Amount</Label>
                                        <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 font-semibold text-foreground">
                                            R {formData.amount || "0.00"}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>Start Location</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input 
                                                className="pl-9"
                                                placeholder="From..."
                                                value={formData.start_location}
                                                onChange={(e) => setFormData({...formData, start_location: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label>End Location</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input 
                                                className="pl-9"
                                                placeholder="To..."
                                                value={formData.end_location}
                                                onChange={(e) => setFormData({...formData, end_location: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <Label>Purpose of Trip</Label>
                                    <Input
                                        value={formData.description}
                                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                                        placeholder="Client meeting, site visit, etc."
                                        required={activeTab === 'mileage'}
                                    />
                                </div>
                            </TabsContent>

                            {/* Common Fields */}
                            <Separator className="my-6" />

                            <div className="space-y-4">
                                {activeTab === 'general' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label>Date *</Label>
                                            <Input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <Label>Attachments & Receipts</Label>
                                    <div className="mt-2 space-y-3">
                                        {formData.attachments?.map((file, index) => (
                                            <div key={index} className="flex items-center justify-between rounded-md border border-border bg-muted/50 p-2">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                                                    <span className="text-sm truncate">{file.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="w-4 h-4 text-primary" />
                                                    </a>
                                                    <button type="button" onClick={() => removeAttachment(index)}>
                                                        <X className="w-4 h-4 text-red-500" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <input
                                                    type="file"
                                                    name="expense_attachments"
                                                    multiple
                                                    onChange={handleFileUpload}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />
                                                <Button type="button" variant="outline" className="w-full">
                                                    <Upload className="w-4 h-4 mr-2" />
                                                    Upload Files
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <Label>Notes</Label>
                                    <Textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        rows={2}
                                    />
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="is_claimable"
                                        checked={formData.is_claimable}
                                        onCheckedChange={(checked) => setFormData({...formData, is_claimable: checked})}
                                    />
                                    <label
                                        htmlFor="is_claimable"
                                        className="text-sm font-medium leading-none cursor-pointer"
                                    >
                                        This expense is claimable
                                    </label>
                                </div>
                            </div>
                        </Tabs>
                    </form>
                </div>

                <div className="sticky bottom-0 z-10 flex shrink-0 gap-3 rounded-b-xl border-t border-border bg-card/95 p-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.75rem))] backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:static sm:bg-muted/40 sm:p-6 sm:pb-6">
                    <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                        Cancel
                    </Button>
                    <Button type="submit" onClick={handleSubmit} className="flex-1 bg-primary hover:bg-primary/90">
                        {expense ? 'Update' : 'Create'} {activeTab === 'mileage' ? 'Trip' : 'Expense'}
                    </Button>
                </div>
            </div>
        </div>
    );

    if (typeof document === "undefined") return null;
    return createPortal(modal, document.body);
}