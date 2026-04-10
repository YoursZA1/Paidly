import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Quote } from "@/api/entities";
import { useAuth } from "@/contexts/AuthContext";
import { useQuotes } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, LayoutGrid, List, ChevronLeft, ChevronRight, Download, Upload, MoreVertical, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { quotesToCsv, parseQuoteCsv, csvRowToQuotePayload } from "@/utils/quoteCsvMapping";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import QuoteList from "../components/quote/QuoteList";
import QuoteGrid from "../components/quote/QuoteGrid";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { useAppStore } from "@/stores/useAppStore";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function QuotesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user: authUser } = useAuth();
    const quotesFromStore = useAppStore((s) => s.quotes);
    const clients = useAppStore((s) => s.clients);
    const userProfile = useAppStore((s) => s.userProfile);
    const {
        quotes: quotesFromQuery,
        loading: quotesLoading,
        isFetching: quotesFetching,
        isError: quotesQueryError,
        error: quotesErrorObj,
        refetch: refetchQuotes,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useQuotes(authUser);

    const quotes =
        quotesFromQuery.length > 0 || !quotesLoading
            ? quotesFromQuery
            : (quotesFromStore ?? []);

    const isRefreshing = quotesFetching && quotesFromQuery.length > 0;
    const initialError =
        quotesQueryError && quotes.length === 0 ? quotesErrorObj : null;

    const isLoading = quotesLoading && quotes.length === 0;

    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState('date_newest');
    const [viewMode, setViewMode] = useState('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isImporting, setIsImporting] = useState(false);
    const quoteFileInputRef = useRef(null);
    const quotesLoadMoreRef = useRef(null);

    useEffect(() => {
        if (initialError) {
            toast({
                title: "Could not load quotes",
                description: initialError?.message ?? String(initialError),
                variant: "destructive",
            });
        }
    }, [initialError, toast]);

    const handleRefresh = useCallback(() => {
        void refetchQuotes();
    }, [refetchQuotes]);

    useSupabaseRealtime(
        ["quotes"],
        async () => {
            queryClient.invalidateQueries({ queryKey: ["quotes", "list"], exact: false });
            await refetchQuotes();
        },
        { channelName: "quotes-page" }
    );

    useEffect(() => {
        const el = quotesLoadMoreRef.current;
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

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const userCurrency = userProfile?.currency || 'ZAR';

    const filteredQuotes = quotes.filter((quote) => {
        const title = (quote.project_title || "").toLowerCase();
        const num = (quote.quote_number || "").toLowerCase();
        const term = searchTerm.toLowerCase();
        return (
            title.includes(term) ||
            num.includes(term) ||
            getClientName(quote.client_id).toLowerCase().includes(term)
        );
    });

    // Apply sorting
    const sortedQuotes = [...filteredQuotes].sort((a, b) => {
        switch (sortBy) {
            case 'date_newest':
                return new Date(b.created_date) - new Date(a.created_date);
            case 'date_oldest':
                return new Date(a.created_date) - new Date(b.created_date);
            case 'amount_highest':
                return (b.total_amount || 0) - (a.total_amount || 0);
            case 'amount_lowest':
                return (a.total_amount || 0) - (b.total_amount || 0);
            default:
                return new Date(b.created_date) - new Date(a.created_date);
        }
    });

    // Pagination logic
    const totalPages = Math.ceil(sortedQuotes.length / itemsPerPage);
    const paginatedQuotes = sortedQuotes.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when search/sort changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, sortBy]);

    const handleExportQuotes = async () => {
        const listToExport = sortedQuotes;
        if (listToExport.length === 0) {
            toast({ title: "No quotes to export", variant: "destructive" });
            return;
        }
        try {
            const ids = listToExport.map((q) => q.id);
            const { data: itemsData } = await supabase.from("quote_items").select("id, quote_id, service_name, description, quantity, unit_price, total_price").in("quote_id", ids);
            const itemsByQuoteId = new Map();
            if (Array.isArray(itemsData)) {
                itemsData.forEach((row) => {
                    if (!itemsByQuoteId.has(row.quote_id)) itemsByQuoteId.set(row.quote_id, []);
                    itemsByQuoteId.get(row.quote_id).push({
                        service_name: row.service_name,
                        description: row.description || "",
                        quantity: Number(row.quantity ?? 1),
                        unit_price: Number(row.unit_price ?? 0),
                        total_price: Number(row.total_price ?? 0),
                    });
                });
            }
            const quotesWithItems = listToExport.map((q) => ({
                ...q,
                items: itemsByQuoteId.get(q.id) || [],
            }));
            const csvContent = quotesToCsv(quotesWithItems);
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Quote_export_${Date.now()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${listToExport.length} quote(s) exported.`, variant: "default" });
        } catch (error) {
            console.error("Export quotes error:", error);
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
    };

    const handleImportQuotes = () => quoteFileInputRef.current?.click();

    const handleImportQuotesFile = async (e) => {
        const file = e.target?.files?.[0];
        e.target.value = "";
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const { headers, rows } = parseQuoteCsv(text);
            let created = 0;
            let skipped = 0;
            for (const row of rows) {
                const payload = csvRowToQuotePayload(headers, row);
                if (!payload || (payload.subtotal === undefined && !payload.total_amount && !payload.items?.length)) {
                    skipped++;
                    continue;
                }
                try {
                    await Quote.create(payload);
                    created++;
                } catch (err) {
                    console.warn("Import quote row failed:", payload?.quote_number, err);
                    skipped++;
                }
            }
            queryClient.invalidateQueries({ queryKey: ["quotes", "list"], exact: false });
            await refetchQuotes();
            toast({
                title: "Import complete",
                description: `${created} quote(s) imported${skipped ? `, ${skipped} skipped.` : "."}`,
                variant: "default",
            });
        } catch (error) {
            console.error("Import quotes error:", error);
            toast({ title: "Import failed", description: error?.message || "Could not parse CSV.", variant: "destructive" });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">Quotes</h1>
                        <p className="text-sm text-muted-foreground">
                            Create, manage, and track your project quotations.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto items-center">
                        <input
                            type="file"
                            name="quotes_import_csv"
                            ref={quoteFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportQuotesFile}
                        />
                        {/* Primary action first on mobile */}
                        <Link to={createPageUrl("CreateQuote")} className="order-first sm:order-none w-full sm:w-auto">
                            <Button className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-9 px-4 touch-manipulation">
                                <Plus className="w-4 h-4" />
                                Create Quote
                            </Button>
                        </Link>

                        {/* View toggle */}
                        <div className="flex bg-muted/50 p-1 rounded-xl border border-border h-10 shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-lg shrink-0 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-lg shrink-0 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-xl shrink-0 touch-manipulation"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            aria-label="Refresh quotes"
                            title="Refresh list"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </Button>

                        {/* Mobile: import/export in dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="sm:hidden h-10 min-w-[44px] rounded-xl touch-manipulation"
                                    aria-label="More actions"
                                >
                                    <MoreVertical className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl">
                                <DropdownMenuItem
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="rounded-lg"
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                                    Refresh
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleImportQuotes} disabled={isImporting} className="rounded-lg">
                                    <Upload className="w-4 h-4 mr-2" />
                                    {isImporting ? "Importing…" : "Import CSV"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportQuotes} disabled={sortedQuotes.length === 0} className="rounded-lg">
                                    <Download className="w-4 h-4 mr-2" />
                                    Export CSV
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Desktop: buttons */}
                        <div className="hidden sm:flex flex-wrap gap-2 items-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleImportQuotes}
                                disabled={isImporting}
                                className="rounded-xl"
                            >
                                <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                                {isImporting ? "Importing…" : "Import CSV"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportQuotes}
                                disabled={sortedQuotes.length === 0}
                                className="rounded-xl"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export CSV
                            </Button>
                        </div>
                        <Link to={createPageUrl("QuoteTemplates")} className="flex-1 sm:flex-none">
                            <Button variant="outline" className="w-full sm:w-auto rounded-xl">
                                <FileText className="w-4 h-4 mr-2" />
                                Templates
                            </Button>
                        </Link>
                    </div>
                </motion.div>

                <Card className="gap-0 rounded-xl border border-border p-0 shadow-sm">
                    <CardHeader className="px-4 pb-2 pt-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <CardTitle>Quote List</CardTitle>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <div className="relative flex-1 sm:max-w-xs">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search by quote number, client, or project..."
                                        className="pl-10 h-10 rounded-xl w-full"
                                    />
                                </div>
                                <Select value={sortBy} onValueChange={setSortBy}>
                                    <SelectTrigger className="w-[180px] h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="date_newest">Newest First</SelectItem>
                                        <SelectItem value="date_oldest">Oldest First</SelectItem>
                                        <SelectItem value="amount_highest">Highest Amount</SelectItem>
                                        <SelectItem value="amount_lowest">Lowest Amount</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        {hasNextPage && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Search applies to quotes loaded so far. Scroll the list to load older quotes.
                            </p>
                        )}
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
                        {initialError && (
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-3 mb-4">
                                <p className="text-sm text-amber-800 dark:text-amber-200 flex-1 min-w-0">
                                    {quotes.length > 0
                                        ? "Could not refresh quotes. Showing cached data."
                                        : "Could not load quotes. Try again or refresh the page."}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void refetchQuotes()}
                                    disabled={quotesFetching}
                                    className="shrink-0 gap-1"
                                >
                                    {quotesFetching ? "Loading…" : "Try again"}
                                </Button>
                            </div>
                        )}
                        {isLoading ? (
                            viewMode === 'list' ? (
                                <QuoteList isLoading={true} />
                            ) : (
                                <QuoteGrid isLoading={true} />
                            )
                        ) : sortedQuotes.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="mx-auto w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
                                    <FileText className="h-7 w-7 text-muted-foreground" />
                                </div>
                                <h3 className="mt-2 text-base font-semibold text-foreground font-display">No quotes yet</h3>
                                <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">Send professional quotes in ZAR or any currency. Convert to invoices when approved.</p>
                                <div className="mt-6">
                                    <Link to={createPageUrl("CreateQuote")}>
                                        <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                                            <Plus className="-ml-1 mr-2 h-5 w-5" />
                                            Create your first quote
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <>
                                {viewMode === 'list' ? (
                                    <QuoteList 
                                        quotes={paginatedQuotes} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        onActionSuccess={() => {
                                            queryClient.invalidateQueries({ queryKey: ["quotes", "list"], exact: false });
                                            void refetchQuotes();
                                        }}
                                    />
                                ) : (
                                    <QuoteGrid 
                                        quotes={paginatedQuotes} 
                                        clients={clients} 
                                        userCurrency={userCurrency}
                                        onActionSuccess={() => {
                                            queryClient.invalidateQueries({ queryKey: ["quotes", "list"], exact: false });
                                            void refetchQuotes();
                                        }}
                                    />
                                )}

                                {(hasNextPage || isFetchingNextPage) && (
                                    <div
                                        ref={quotesLoadMoreRef}
                                        className="mt-6 flex min-h-[52px] flex-col items-center justify-center gap-2 border-t pt-4"
                                        aria-live="polite"
                                    >
                                        {isFetchingNextPage ? (
                                            <span className="text-sm text-muted-foreground">Loading more quotes…</span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                More quotes available — scroll down to load older rows
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-slate-600">Show</span>
                                            <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                                                <SelectTrigger className="w-[70px] h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="10">10</SelectItem>
                                                    <SelectItem value="25">25</SelectItem>
                                                    <SelectItem value="50">50</SelectItem>
                                                    <SelectItem value="100">100</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <span className="text-sm text-slate-600">
                                                of {sortedQuotes.length} quotes
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" />
                                                Previous
                                            </Button>
                                            
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (totalPages <= 5) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage <= 3) {
                                                        pageNum = i + 1;
                                                    } else if (currentPage >= totalPages - 2) {
                                                        pageNum = totalPages - 4 + i;
                                                    } else {
                                                        pageNum = currentPage - 2 + i;
                                                    }
                                                    return (
                                                        <Button
                                                            key={i}
                                                            variant={currentPage === pageNum ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => setCurrentPage(pageNum)}
                                                            className="w-9 h-9"
                                                        >
                                                            {pageNum}
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                            
                                            <Button
                                                variant="outline"
                                                size="sm"
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