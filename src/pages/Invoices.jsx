import React, { useState, useEffect, useMemo, useRef } from "react";
import { Invoice, Payment, InvoiceView } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, LayoutGrid, List, ChevronLeft, ChevronRight, Download, Upload, MoreVertical } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { invoicesToCsv, parseInvoiceCsv, csvRowToInvoicePayload } from "@/utils/invoiceCsvMapping";
import { invoiceViewsToCsv, parseInvoiceViewCsv, csvRowToInvoiceViewPayload } from "@/utils/invoiceViewCsvMapping";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { runPaidConfetti } from '@/utils/confetti';
import { motion } from "framer-motion";
import InvoiceList from "../components/invoice/InvoiceList";
import InvoiceGrid from "../components/invoice/InvoiceGrid";
import InvoiceFilters, { applyInvoiceFilters } from "../components/filters/InvoiceFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { useAppStore } from "@/stores/useAppStore";

export default function InvoicesPage() {
    const { toast } = useToast();
    const invoices = useAppStore((s) => s.invoices);
    const clients = useAppStore((s) => s.clients);
    const userProfile = useAppStore((s) => s.userProfile);
    const payments = useAppStore((s) => s.payments);
    const invoiceViews = useAppStore((s) => s.invoiceViews);
    const isLoading = useAppStore((s) => s.isLoading);
    const error = useAppStore((s) => s.error);
    const fetchAll = useAppStore((s) => s.fetchAll);
    const updateInvoice = useAppStore((s) => s.updateInvoice);

    const [filters, setFilters] = useState({});
    const [viewMode, setViewMode] = useState('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isImportingViews, setIsImportingViews] = useState(false);
    const invoiceFileInputRef = useRef(null);
    const invoiceViewsFileInputRef = useRef(null);

    useSupabaseRealtime(
        ["invoices", "payments"],
        () => { fetchAll(); },
        { channelName: "invoices-page" }
    );

    const getClientName = (clientId) => {
        const client = clients.find((c) => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const userCurrency = userProfile?.currency || "ZAR";

    const paymentsMap = useMemo(() => {
        const map = new Map();
        (payments || []).forEach((p) => {
            if (!p?.invoice_id) return;
            if (!map.has(p.invoice_id)) map.set(p.invoice_id, []);
            map.get(p.invoice_id).push(p);
        });
        return map;
    }, [payments]);

    useEffect(() => {
        if (error && !isLoading) {
            toast({
                title: "Could not load invoices",
                description: error,
                variant: "destructive",
            });
        }
    }, [error, isLoading, toast]);

    const filteredInvoices = applyInvoiceFilters(invoices, filters, getClientName);
    
    // Pagination logic
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginatedInvoices = filteredInvoices.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    const handleExportInvoices = async () => {
        const listToExport = filteredInvoices;
        if (listToExport.length === 0) {
            toast({ title: "No invoices to export", variant: "destructive" });
            return;
        }
        setIsExporting(true);
        try {
            const ids = listToExport.map((i) => i.id);
            const { data: itemsData } = await supabase.from("invoice_items").select("*").in("invoice_id", ids);
            const itemsByInvoiceId = new Map();
            if (Array.isArray(itemsData)) {
                itemsData.forEach((row) => {
                    if (!itemsByInvoiceId.has(row.invoice_id)) itemsByInvoiceId.set(row.invoice_id, []);
                    itemsByInvoiceId.get(row.invoice_id).push({
                        service_name: row.service_name,
                        description: row.description || "",
                        quantity: Number(row.quantity ?? 1),
                        unit_price: Number(row.unit_price ?? 0),
                        total_price: Number(row.total_price ?? 0),
                    });
                });
            }
            const invoicesWithItems = listToExport.map((inv) => ({
                ...inv,
                items: itemsByInvoiceId.get(inv.id) || [],
            }));
            const csvContent = invoicesToCsv(invoicesWithItems, paymentsMap);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Invoice_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${listToExport.length} invoice(s) exported.`, variant: "default" });
        } catch (error) {
            console.error("Export invoices error:", error);
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
        setIsExporting(false);
    };

    const handleImportInvoices = () => invoiceFileInputRef.current?.click();

    const handleImportInvoicesFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseInvoiceCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const { payload, payments: rowPayments } = csvRowToInvoicePayload(headers, row);
                if (!payload || (payload.subtotal === undefined && !payload.total_amount && !payload.items?.length)) {
                    skipped++;
                    continue;
                }
                try {
                    const createdInvoice = await Invoice.create(payload);
                    created++;
                    if (Array.isArray(rowPayments) && rowPayments.length > 0 && createdInvoice?.id) {
                        for (const p of rowPayments) {
                            if (!p.amount) continue;
                            try {
                                await Payment.create({
                                    invoice_id: createdInvoice.id,
                                    amount: p.amount,
                                    paid_at: p.paid_at || undefined,
                                    method: p.method || undefined,
                                    reference: p.notes || undefined,
                                    status: "completed",
                                });
                            } catch (err) {
                                console.warn("Import payment failed for invoice", createdInvoice.id, err);
                            }
                        }
                    }
                } catch (err) {
                    console.warn("Import invoice row failed:", payload?.invoice_number, err);
                    skipped++;
                }
            }
            await fetchAll();
            toast({
                title: "Import complete",
                description: `${created} invoice(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import invoices error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        }
        setIsImporting(false);
    };

    const handleExportInvoiceViews = () => {
        if (invoiceViews.length === 0) {
            toast({ title: "No invoice views to export", variant: "destructive" });
            return;
        }
        try {
            const csvContent = invoiceViewsToCsv(invoiceViews);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `InvoiceView_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${invoiceViews.length} view(s) exported.`, variant: "default" });
        } catch (error) {
            console.error("Export invoice views error:", error);
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
    };

    const handleImportInvoiceViews = () => invoiceViewsFileInputRef.current?.click();

    const handleImportInvoiceViewsFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImportingViews(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseInvoiceViewCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToInvoiceViewPayload(headers, row);
                if (!payload) {
                    skipped++;
                    continue;
                }
                try {
                    await InvoiceView.create(payload);
                    created++;
                } catch (err) {
                    console.warn("Import invoice view row failed:", payload?.invoice_id, err);
                    skipped++;
                }
            }
            await fetchAll();
            toast({
                title: "Import complete",
                description: `${created} view(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import invoice views error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        }
        setIsImportingViews(false);
    };

    return (
        <div className="min-h-screen bg-background w-full min-w-0 mobile-page px-4 sm:px-6">
            <div className="max-w-7xl mx-auto w-full min-w-0">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8"
                >
                    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
                        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground font-display truncate">
                            Invoices
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Track, manage, and download all your invoices.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                        <input type="file" ref={invoiceFileInputRef} accept=".csv" className="hidden" onChange={handleImportInvoicesFile} />
                        <input type="file" ref={invoiceViewsFileInputRef} accept=".csv" className="hidden" onChange={handleImportInvoiceViewsFile} />
                        {/* Primary action first on mobile */}
                        <Link to={createPageUrl("CreateInvoice")} className="order-first sm:order-none w-full sm:w-auto">
                            <Button className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 h-11 sm:h-9 rounded-xl gap-2 touch-manipulation">
                                <Plus className="w-4 h-4 shrink-0" />
                                Create Invoice
                            </Button>
                        </Link>
                        {/* View toggle: always visible */}
                        <div className="flex bg-muted/50 p-1 rounded-xl border border-border h-10 shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-lg shrink-0 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-label="Grid view"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-lg shrink-0 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-label="List view"
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                        {/* Mobile: Import/Export in dropdown; Desktop: all visible */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="sm:hidden h-10 min-w-[44px] rounded-xl touch-manipulation" aria-label="More actions">
                                    <MoreVertical className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl">
                                <DropdownMenuItem onClick={handleImportInvoices} disabled={isImporting} className="rounded-lg">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {isImporting ? "Importing…" : "Import CSV"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportInvoices} disabled={isExporting || filteredInvoices.length === 0} className="rounded-lg">
                                    <Download className="w-4 h-4 mr-2" />
                                    {isExporting ? "Exporting…" : "Export CSV"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleImportInvoiceViews} disabled={isImportingViews} className="rounded-lg">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {isImportingViews ? "Importing…" : "Import views CSV"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportInvoiceViews} disabled={invoiceViews.length === 0} className="rounded-lg">
                                    <Download className="w-4 h-4 mr-2" />
                                    Export views CSV
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="hidden sm:flex flex-wrap gap-2 items-center">
                            <Button variant="outline" size="sm" onClick={handleImportInvoices} disabled={isImporting} className="rounded-xl">
                                <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                                {isImporting ? "Importing…" : "Import CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportInvoices} disabled={isExporting || filteredInvoices.length === 0} className="rounded-xl">
                                <Download className="w-4 h-4 mr-2" />
                                {isExporting ? "Exporting…" : "Export CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleImportInvoiceViews} disabled={isImportingViews} className="rounded-xl" title="Import invoice view activity (InvoiceView_export.csv)">
                                <Upload className={`w-4 h-4 mr-2 ${isImportingViews ? "animate-pulse" : ""}`} />
                                {isImportingViews ? "Importing…" : "Import views CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportInvoiceViews} disabled={invoiceViews.length === 0} className="rounded-xl" title="Export invoice view activity">
                                <Download className="w-4 h-4 mr-2" />
                                Export views CSV
                            </Button>
                        </div>
                    </div>
                </motion.div>

                <Card className="rounded-xl overflow-hidden w-full min-w-0 mobile-card-wrap">
                    <CardHeader className="p-3 sm:p-4 md:p-6">
                        <div className="space-y-4">
                            <CardTitle className="text-base font-semibold text-foreground">Invoice List</CardTitle>
                            <InvoiceFilters 
                                onFilterChange={setFilters} 
                                clients={clients}
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6 overflow-hidden">
                        {isLoading ? (
                             viewMode === 'list' ? (
                                <InvoiceList isLoading={true} />
                             ) : (
                                <InvoiceGrid isLoading={true} />
                             )
                        ) : filteredInvoices.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
                                    <FileText className="h-7 w-7 text-muted-foreground" />
                                </div>
                                <h3 className="mt-2 text-base font-semibold text-foreground font-display">No invoices yet</h3>
                                <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">Create and send invoices in ZAR or any currency. Get paid faster.</p>
                                <div className="mt-6">
                                    <Link to={createPageUrl("CreateInvoice")}>
                                        <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                                            <Plus className="-ml-1 mr-2 h-5 w-5" />
                                            Create your first invoice
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <>
                                {viewMode === 'list' ? (
                                    <InvoiceList 
                                        invoices={paginatedInvoices} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        paymentsMap={paymentsMap}
                                        onActionSuccess={fetchAll}
                                        onPaymentFullyPaid={runPaidConfetti}
                                        onOptimisticUpdate={(id, status) => updateInvoice(id, { status })}
                                    />
                                ) : (
                                    <InvoiceGrid 
                                        invoices={paginatedInvoices} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        paymentsMap={paymentsMap}
                                        onActionSuccess={fetchAll}
                                        onPaymentFullyPaid={runPaidConfetti}
                                        onOptimisticUpdate={(id, status) => updateInvoice(id, { status })}
                                    />
                                )}
                                
                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border pt-4">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>Show</span>
                                            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                                                <SelectTrigger className="w-[70px] h-9 rounded-lg">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span>of {filteredInvoices.length} invoices</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" />
                                                Previous
                                            </Button>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (totalPages <= 5) pageNum = i + 1;
                                                    else if (currentPage <= 3) pageNum = i + 1;
                                                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                                    else pageNum = currentPage - 2 + i;
                                                    return (
                                                        <Button
                                                            key={i}
                                                            variant={currentPage === pageNum ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className="w-9 h-9 rounded-lg"
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-lg"
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                            >
                                                Next
                                                <ChevronRight className="w-4 h-4 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}