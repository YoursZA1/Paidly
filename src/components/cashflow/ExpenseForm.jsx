import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ExternalLink, ScanLine, Paperclip, Upload, Loader2, Sparkles, MapPin, Car } from "lucide-react";
import { format } from "date-fns";
import { Vendor } from "@/api/entities";
import { breakApi } from "@/api/apiClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function ExpenseForm({ expense, onSave, onCancel }) {
    const [formData, setFormData] = useState(expense || {
        category: "office",
        description: "",
        amount: "",
        date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: "bank_transfer",
        vendor: "",
        vendor_id: "",
        receipt_url: "",
        attachments: [],
        is_claimable: true,
        notes: "",
        is_mileage: false,
        distance: "",
        distance_unit: "km",
        rate_per_unit: 4.84, // Default SARS rate approx
        start_location: "",
        end_location: ""
    });

    const [vendors, setVendors] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [activeTab, setActiveTab] = useState(expense?.is_mileage ? "mileage" : "general");

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
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const dataToSave = {
            ...formData,
            amount: parseFloat(formData.amount),
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
                const { file_url } = await breakApi.integrations.Core.UploadFile({ file });
                newAttachments.push({ name: file.name, url: file_url });
            } catch (error) {
                console.error("File upload failed", error);
            }
        }

        setFormData(prev => ({ ...prev, attachments: newAttachments }));
    };

    const handleScanReceipt = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsScanning(true);
        try {
            // 1. Upload
            const { file_url } = await breakApi.integrations.Core.UploadFile({ file });
            
            // 2. Add to attachments
            const newAttachments = [...(formData.attachments || []), { name: file.name, url: file_url }];
            
            // 3. Extract Data
            const schema = {
                type: "object",
                properties: {
                    vendor_name: { type: "string" },
                    date: { type: "string", format: "date" },
                    amount: { type: "number" },
                    description: { type: "string" },
                    category: { 
                        type: "string", 
                        enum: ["office", "travel", "utilities", "supplies", "salary", "marketing", "software", "consulting", "legal", "maintenance", "vehicle", "meals", "other"]
                    }
                }
            };

            const result = await breakApi.integrations.Core.ExtractDataFromUploadedFile({
                file_url,
                json_schema: schema
            });

            if (result.status === "success" && result.output) {
                const data = result.output;
                setFormData(prev => ({
                    ...prev,
                    attachments: newAttachments,
                    amount: data.amount || prev.amount,
                    date: data.date || prev.date,
                    description: data.description || `Receipt from ${data.vendor_name || 'Unknown'}`,
                    category: data.category || prev.category,
                    vendor: data.vendor_name || prev.vendor,
                    // Try to match vendor
                    vendor_id: vendors.find(v => v.name.toLowerCase() === data.vendor_name?.toLowerCase())?.id || prev.vendor_id
                }));
            } else {
                setFormData(prev => ({ ...prev, attachments: newAttachments }));
                alert("Could not extract data, but receipt was attached.");
            }

        } catch (error) {
            console.error("Scanning failed", error);
            alert("Failed to scan receipt.");
        }
        setIsScanning(false);
    };

    const suggestCategory = async () => {
        if (!formData.description && !formData.vendor) return;
        setIsSuggesting(true);
        try {
            const prompt = `Suggest a category for an expense based on this description: "${formData.description}" and vendor: "${formData.vendor}". 
            Categories: office, travel, utilities, supplies, salary, marketing, software, consulting, legal, maintenance, vehicle, meals, other.
            Return ONLY the category name.`;
            
            const category = await breakApi.integrations.Core.InvokeLLM({ prompt });
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
        }
        setIsSuggesting(false);
    };

    const removeAttachment = (index) => {
        const newAttachments = [...formData.attachments];
        newAttachments.splice(index, 1);
        setFormData(prev => ({ ...prev, attachments: newAttachments }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-6 border-b shrink-0">
                    <h2 className="text-xl font-semibold">
                        {expense ? 'Edit Expense' : 'Add New Expense'}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-6">
                                <TabsTrigger value="general">General Expense</TabsTrigger>
                                <TabsTrigger value="mileage">Mileage Tracking</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-4">
                                {/* Scan Button */}
                                <div className="flex justify-center mb-4">
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="image/*,.pdf"
                                            onChange={handleScanReceipt}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={isScanning}
                                        />
                                        <Button type="button" variant="outline" className="border-dashed border-2 w-full" disabled={isScanning}>
                                            {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ScanLine className="w-4 h-4 mr-2 text-indigo-600" />}
                                            {isScanning ? "Scanning Receipt..." : "Scan Receipt with AI"}
                                        </Button>
                                    </div>
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
                                            className="text-xs text-indigo-600 flex items-center hover:underline disabled:opacity-50"
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
                                        <div className="flex items-center h-10 px-3 border rounded-md bg-gray-50 text-gray-500">
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
                                        <div className="h-10 px-3 border rounded-md bg-gray-100 flex items-center font-semibold">
                                            R {formData.amount || "0.00"}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <Label>Start Location</Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                                            <div key={index} className="flex items-center justify-between p-2 border rounded-md bg-gray-50">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <Paperclip className="w-4 h-4 text-gray-500 shrink-0" />
                                                    <span className="text-sm truncate">{file.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="w-4 h-4 text-blue-600" />
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

                <div className="p-6 border-t bg-gray-50 rounded-b-xl flex gap-3 shrink-0">
                    <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                        {expense ? 'Update' : 'Create'} {activeTab === 'mileage' ? 'Trip' : 'Expense'}
                    </Button>
                </div>
            </div>
        </div>
    );
}