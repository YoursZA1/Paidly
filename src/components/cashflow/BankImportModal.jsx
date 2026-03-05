import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { UploadToBankDetails, ExtractDataFromUploadedFile } from '@/api/integrations';
import { Expense } from '@/api/entities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

export default function BankImportModal({ onImportComplete, onCancel }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Review, 3: Importing
    const [transactions, setTransactions] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        try {
            const { file_url } = await UploadToBankDetails({ file });

            // 2. Extract & Categorize with AI (if you have this API)
            // Move schema definition outside of JSX/JS context to avoid reserved word error
            const schema = {
                type: "object",
                properties: {
                    transactions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                date: { type: "string", format: "date" },
                                description: { type: "string" },
                                amount: { type: "number" },
                                vendor: { type: "string" },
                                category: {
                                    type: "string",
                                    enum: ["office", "travel", "utilities", "supplies", "salary", "marketing", "software", "consulting", "legal", "maintenance", "vehicle", "meals", "other"]
                                }
                            },
                            required: ["date", "description", "amount"]
                        }
                    }
                }
            };

            const result = await ExtractDataFromUploadedFile({
                file_url,
                json_schema: schema
            });

            if (result.status === 'success' && result.output?.transactions) {
                // Add selection state and sanitize
                const parsed = result.output.transactions.map((t, i) => ({
                    ...t,
                    id: i,
                    selected: true,
                    // Ensure category is valid or default to 'other'
                    category: t.category || 'other',
                    // Handle negative amounts (bank exports often show expenses as negative)
                    amount: Math.abs(t.amount)
                }));
                setTransactions(parsed);
                setStep(2);
            } else {
                alert("Failed to parse bank statement. Please check the file format.");
            }
        } catch (error) {
            console.error("Import failed:", error);
            alert("Error importing file. Please try again.");
        }
        setIsProcessing(false);
    };

    const handleImport = async () => {
        setIsProcessing(true);
        const selected = transactions.filter(t => t.selected);
        let importedCount = 0;

        try {
            // Bulk create expenses
            // Note: Parallel execution for speed
            const promises = selected.map(t => Expense.create({
                date: t.date,
                description: t.description,
                amount: t.amount,
                vendor: t.vendor || t.description, // Fallback vendor
                category: t.category,
                payment_method: 'bank_transfer',
                expense_number: `IMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                is_claimable: true,
                approval_status: 'pending'
            }));

            await Promise.all(promises);
            importedCount = selected.length;
            
            onImportComplete(importedCount);
        } catch (error) {
            console.error("Bulk create failed:", error);
            alert("Some transactions failed to import.");
        }
        setIsProcessing(false);
    };

    const toggleTransaction = (id) => {
        setTransactions(transactions.map(t => 
            t.id === id ? { ...t, selected: !t.selected } : t
        ));
    };

    const updateTransaction = (id, field, value) => {
        setTransactions(transactions.map(t => 
            t.id === id ? { ...t, [field]: value } : t
        ));
    };

    return (
        <Dialog open={true} onOpenChange={() => !isProcessing && onCancel()}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Import Bank Transactions</DialogTitle>
                    <DialogDescription>
                        Upload a CSV statement. AI will automatically categorize transactions.
                    </DialogDescription>
                </DialogHeader>

                {step === 1 && (
                    <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-slate-50">
                        {isProcessing ? (
                            <div className="text-center space-y-4">
                                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                                <p className="text-slate-600">Analyzing statement & categorizing...</p>
                            </div>
                        ) : (
                            <>
                                <FileSpreadsheet className="w-12 h-12 text-slate-400 mb-4" />
                                <Label htmlFor="file-upload" className="cursor-pointer">
                                    <div className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors">
                                        Select CSV File
                                    </div>
                                    <Input 
                                        id="file-upload" 
                                        type="file" 
                                        accept=".csv,.xlsx" 
                                        className="hidden" 
                                        onChange={handleFileUpload}
                                    />
                                </Label>
                                <p className="mt-4 text-sm text-slate-500">Supported formats: CSV, Excel</p>
                            </>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <div className="mb-4 flex justify-between items-center">
                            <p className="text-sm text-slate-600">
                                Review imported transactions. {transactions.filter(t => t.selected).length} selected.
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setTransactions(transactions.map(t => ({...t, selected: true})))}>Select All</Button>
                                <Button variant="outline" size="sm" onClick={() => setTransactions(transactions.map(t => ({...t, selected: false})))}>Deselect All</Button>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 border rounded-md">
                            <div className="p-4 space-y-2">
                                {transactions.map((t) => (
                                    <div key={t.id} className={`flex items-center gap-4 p-3 rounded-lg border ${t.selected ? 'bg-white border-primary/20 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                        <Checkbox 
                                            checked={t.selected} 
                                            onCheckedChange={() => toggleTransaction(t.id)}
                                        />
                                        
                                        <div className="w-32">
                                            <Input 
                                                type="date" 
                                                value={t.date} 
                                                onChange={(e) => updateTransaction(t.id, 'date', e.target.value)}
                                                className="h-8 text-xs"
                                            />
                                        </div>

                                        <div className="flex-1">
                                            <Input 
                                                value={t.description} 
                                                onChange={(e) => updateTransaction(t.id, 'description', e.target.value)}
                                                className="h-8 text-xs mb-1"
                                                placeholder="Description"
                                            />
                                            <Input 
                                                value={t.vendor} 
                                                onChange={(e) => updateTransaction(t.id, 'vendor', e.target.value)}
                                                className="h-8 text-xs bg-slate-50"
                                                placeholder="Vendor (Optional)"
                                            />
                                        </div>

                                        <div className="w-32">
                                             <Select 
                                                value={t.category} 
                                                onValueChange={(val) => updateTransaction(t.id, 'category', val)}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
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

                                        <div className="w-24 font-mono text-right text-sm">
                                            {t.amount.toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                )}

                <DialogFooter className="mt-4">
                    {step === 2 && (
                        <>
                            <Button variant="outline" onClick={() => setStep(1)} disabled={isProcessing}>Back</Button>
                            <Button onClick={handleImport} disabled={isProcessing || transactions.filter(t => t.selected).length === 0} className="bg-primary hover:bg-primary/90">
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                Import {transactions.filter(t => t.selected).length} Transactions
                            </Button>
                        </>
                    )}
                    {step === 1 && (
                        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}