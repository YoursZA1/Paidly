import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Invoice, Payment, InvoiceView } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, LayoutGrid, List, Download, Upload, MoreVertical, RefreshCw } from "lucide-react";
import { parseInvoiceCsv, csvRowToInvoicePayload } from "@/utils/invoiceCsvMapping";
import { invoiceViewsToCsv, parseInvoiceViewCsv, csvRowToInvoiceViewPayload } from "@/utils/invoiceViewCsvMapping";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { runPaidConfetti } from '@/utils/confetti';
import { motion } from "framer-motion";
import InvoiceList from "../components/invoice/InvoiceList";
import InvoiceGrid from "../components/invoice/InvoiceGrid";
import InvoiceFilters from "../components/filters/InvoiceFilters";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { useAppStore } from "@/stores/useAppStore";
import { useAuth } from "@/contexts/AuthContext";
import { useInvoices } from "@/hooks/useInvoices";
import { useInvoiceSideData } from "@/hooks/useInvoiceSideData";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useAppContext } from "@/contexts/AppContext";
import { useDocumentListController, buildLookupMap } from "@/hooks/useDocumentListController";
import { invoiceListAdapter } from "@/services/documentListAdapters";
import DocumentListPagination from "@/components/shared/DocumentListPagination";
import { exportInvoicesCsvWithItems } from "@/services/DocumentExportService";

export default function InvoicesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user: authUser, authUserId } = useAuth();
    const [filters, setFilters] = useState({});
    const [sideDataEnabled, setSideDataEnabled] = useState(false);
    const {
        loading: invoicesLoading,
        invoices,
        refetch: refetchInvoices,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInvoices({ userId: authUser?.id ?? null, filters });
    const {
        payments,
        invoiceViews,
        isFetching: isRefreshing,
        error: initialError,
        refetch: refetchSideData,
    } = useInvoiceSideData(authUserId, { enabled: sideDataEnabled, staleTime: 5 * 60 * 1000 });
    const { profile } = useUserProfileQuery();
    const { setLoading: setAppLoading } = useAppContext();
    const storeUpdateInvoice = useAppStore((s) => s.updateInvoice);
    const clientsFromStore = useAppStore((s) => s.clients);

    const clients = clientsFromStore ?? [];
    const isLoading = invoicesLoading && invoices.length === 0;

    const handleActionSuccess = useCallback(() => {
        void refetchInvoices();
    }, [refetchInvoices]);

    const handleRefresh = useCallback(async () => {
        try {
            setSideDataEnabled(true);
            await Promise.all([refetchInvoices(), refetchSideData()]);
        } catch (err) {
            console.warn("Invoices refresh failed:", err);
        }
    }, [refetchInvoices, refetchSideData]);

    const handleOptimisticUpdate = useCallback(
        async (id, status) => {
            await storeUpdateInvoice(id, { status });
            void refetchInvoices();
        },
        [storeUpdateInvoice, refetchInvoices]
    );

    useSupabaseRealtime(
        ["invoices", "payments"],
        () => {
            // Supabase changefeed: refresh list + side data without blocking page.
            void refetchInvoices();
        },
        { channelName: "invoices-page" }
    );

    const [viewMode, setViewMode] = useState('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isImportingViews, setIsImportingViews] = useState(false);
    const invoiceFileInputRef = useRef(null);
    const invoiceViewsFileInputRef = useRef(null);
    const invoiceLoadMoreRef = useRef(null);

    const clientMap = useMemo(() => buildLookupMap(clients), [clients]);

    const userCurrency = profile?.currency || authUser?.currency || "ZAR";

    useEffect(() => {
        setAppLoading(isLoading);
    }, [isLoading, setAppLoading]);

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
        if (initialError) {
            toast({
                title: "Could not load invoice activity",
                description: initialError?.message ?? String(initialError),
                variant: "destructive",
            });
        }
    }, [initialError, toast]);

    const listContext = useMemo(() => ({ filters, clientMap }), [filters, clientMap]);
    const {
        allRows: filteredInvoices,
        paginatedRows: paginatedInvoices,
        totalPages,
        visiblePages,
    } = useDocumentListController({
        documents: invoices,
        currentPage,
        itemsPerPage,
        resetPageDeps: [filters],
        setCurrentPage,
        adapter: invoiceListAdapter,
        context: listContext,
    });

    useEffect(() => {
        const el = invoiceLoadMoreRef.current;
        if (!el || !hasNextPage) return undefined;
        const ob = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) void fetchNextPage();
            },
            { root: null, rootMargin: "240px", threshold: 0 }
        );
        ob.observe(el);
        return () => ob.disconnect();
    }, [hasNextPage, fetchNextPage]);

    const handleExportInvoices = async () => {
        setSideDataEnabled(true);
        const listToExport = filteredInvoices;
        if (listToExport.length === 0) {
            toast({ title: "No invoices to export", variant: "destructive" });
            return;
        }
        setIsExporting(true);
        try {
            const { count } = await exportInvoicesCsvWithItems(listToExport, paymentsMap);
            toast({ title: "Export complete", description: `${count} invoice(s) exported.`, variant: "default" });
        } catch (error) {
            console.error("Export invoices error:", error);
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
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
            await refetchInvoices();
            queryClient.invalidateQueries({ queryKey: ["invoices", "list"], exact: false });
            queryClient.invalidateQueries({ queryKey: ['cashflow-page'] });
            toast({
                title: "Import complete",
                description: `${created} invoice(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import invoices error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    const handleExportInvoiceViews = async () => {
        setSideDataEnabled(true);
        let viewsToExport = invoiceViews;
        if (!sideDataEnabled) {
            const refreshed = await refetchSideData();
            viewsToExport = refreshed?.data?.invoiceViews ?? [];
        }
        if (viewsToExport.length === 0) {
            toast({ title: "No invoice views to export", variant: "destructive" });
            return;
        }
        try {
            const csvContent = invoiceViewsToCsv(viewsToExport);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `InvoiceView_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${viewsToExport.length} view(s) exported.`, variant: "default" });
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
            await refetchInvoices();
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
        <div className="min-h-screen bg-background w-full min-w-0 mobile-page">
            <div className="responsive-page-shell py-4 sm:py-6 md:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="responsive-page-header mb-4 sm:mb-6 md:mb-8"
                >
                    <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
                        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground font-display truncate">
                            Invoices
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Track, manage, and download all your invoices.
                        </p>
                    </div>
                    <div className="responsive-page-header-actions gap-2.5">
                        <input
                            type="file"
                            name="invoices_import_csv"
                            ref={invoiceFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportInvoicesFile}
                        />
                        <input
                            type="file"
                            name="invoice_views_import_csv"
                            ref={invoiceViewsFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportInvoiceViewsFile}
                        />
                        {/* Primary action first on mobile */}
                        <Link to={createPageUrl("CreateInvoice")} className="order-first sm:order-none w-full md:w-auto">
                            <Button className="responsive-btn h-10 w-full gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-[1px] hover:bg-primary/90 hover:shadow-md md:w-auto touch-manipulation">
                                <Plus className="w-4 h-4 shrink-0" />
                                Create Invoice
                            </Button>
                        </Link>
                        {/* View toggle: always visible */}
                        <div className="hidden h-10 shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm sm:flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 shrink-0 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-label="Grid view"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 shrink-0 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-label="List view"
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 min-h-10 min-w-10 shrink-0 rounded-xl border-border bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted touch-manipulation"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            aria-label="Refresh invoices"
                            title="Refresh list"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </Button>
                        {/* Mobile: Import/Export in dropdown; Desktop: all visible */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-10 min-w-[44px] rounded-xl border-border bg-background/80 shadow-sm backdrop-blur-sm sm:hidden touch-manipulation" aria-label="More actions">
                                    <MoreVertical className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl border-border">
                                <DropdownMenuItem
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="rounded-lg"
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                                    Refresh
                                </DropdownMenuItem>
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
                        <div className="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 p-1.5 shadow-sm sm:flex">
                            <Button variant="outline" size="sm" onClick={handleImportInvoices} disabled={isImporting} className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none">
                                <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                                {isImporting ? "Importing…" : "Import CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportInvoices} disabled={isExporting || filteredInvoices.length === 0} className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none">
                                <Download className="w-4 h-4 mr-2" />
                                {isExporting ? "Exporting…" : "Export CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleImportInvoiceViews} disabled={isImportingViews} className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none" title="Import invoice view activity (InvoiceView_export.csv)">
                                <Upload className={`w-4 h-4 mr-2 ${isImportingViews ? "animate-pulse" : ""}`} />
                                {isImportingViews ? "Importing…" : "Import views CSV"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportInvoiceViews} disabled={invoiceViews.length === 0} className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none" title="Export invoice view activity">
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
                            {hasNextPage && (
                                <p className="text-xs text-muted-foreground">
                                    Filters apply to invoices loaded so far. Scroll the list to load older invoices, then filter or export as needed.
                                </p>
                            )}
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
                                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                                    <Link to={createPageUrl("CreateInvoice")}>
                                        <Button className="w-full sm:w-auto rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
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
                                        onActionSuccess={handleActionSuccess}
                                        onPaymentFullyPaid={runPaidConfetti}
                                        onOptimisticUpdate={handleOptimisticUpdate}
                                    />
                                ) : (
                                    <InvoiceGrid 
                                        invoices={paginatedInvoices} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        paymentsMap={paymentsMap}
                                        onActionSuccess={handleActionSuccess}
                                        onPaymentFullyPaid={runPaidConfetti}
                                        onOptimisticUpdate={handleOptimisticUpdate}
                                    />
                                )}
                                
                                {/* Pagination Controls */}
                                {(hasNextPage || isFetchingNextPage) && (
                                    <div
                                        ref={invoiceLoadMoreRef}
                                        className="mt-6 flex min-h-[52px] flex-col items-center justify-center gap-2 border-t border-border pt-4"
                                        aria-live="polite"
                                    >
                                        {isFetchingNextPage ? (
                                            <span className="text-sm text-muted-foreground">Loading more invoices…</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                More invoices available — scroll down to load older rows
                                            </span>
                                        )}
                                    </div>
                                )}

                                <DocumentListPagination
                                    totalPages={totalPages}
                                    currentPage={currentPage}
                                    visiblePages={visiblePages}
                                    onPageChange={setCurrentPage}
                                    itemsPerPage={itemsPerPage}
                                    onItemsPerPageChange={(next) => {
                                        setItemsPerPage(next);
                                        setCurrentPage(1);
                                    }}
                                    totalItems={filteredInvoices.length}
                                    itemLabel="invoices"
                                />
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}