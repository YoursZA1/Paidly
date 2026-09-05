import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Quote } from "@/api/entities";
import { useAuth } from "@/contexts/AuthContext";
import { useQuotes } from "@/hooks/useQuotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DocListLockShell from "@/components/document-table/DocListLockShell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, LayoutGrid, List, Download, Upload, MoreVertical, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { parseQuoteCsv, csvRowToQuotePayload } from "@/utils/quoteCsvMapping";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import QuoteList from "../components/quote/QuoteList";
import QuoteGrid from "../components/quote/QuoteGrid";
import { useAppStore } from "@/stores/useAppStore";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { hasFeature } from "@/data/paidlySubscriptionPlans";
import UpgradePrompt from "@/components/subscription/UpgradePrompt";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { normalizePaidPackageKey, slugFromProfile } from "@/lib/subscriptionPlan";
import { useDocumentListController, buildLookupMap } from "@/hooks/useDocumentListController";
import { quoteListAdapter } from "@/services/documentListAdapters";
import DocumentListPagination from "@/components/shared/DocumentListPagination";
import { exportQuotesCsvWithItems } from "@/services/DocumentExportService";

export default function QuotesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user: authUser } = useAuth();
    const { profile: profileFromQuery, isPending: profileQueryPending } = useUserProfileQuery();
    const quotesFromStore = useAppStore((s) => s.quotes);
    const clients = useAppStore((s) => s.clients);
    const userProfile = useAppStore((s) => s.userProfile);
    const appStoreLoading = useAppStore((s) => s.isLoading);
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

    const clientMap = useMemo(() => buildLookupMap(clients), [clients]);

    const userCurrency = userProfile?.currency || 'ZAR';

    const listContext = useMemo(
        () => ({ searchTerm, sortBy, clientMap }),
        [searchTerm, sortBy, clientMap]
    );
    const {
        allRows: sortedQuotes,
        paginatedRows: paginatedQuotes,
        totalPages,
        visiblePages,
    } = useDocumentListController({
        documents: quotes,
        currentPage,
        itemsPerPage,
        resetPageDeps: [searchTerm, sortBy],
        setCurrentPage,
        adapter: quoteListAdapter,
        context: listContext,
    });

    const handleExportQuotes = async () => {
        const listToExport = sortedQuotes;
        if (listToExport.length === 0) {
            toast({ title: "No quotes to export", variant: "destructive" });
            return;
        }
        try {
            const { count } = await exportQuotesCsvWithItems(listToExport);
            toast({ title: "Export complete", description: `${count} quote(s) exported.`, variant: "default" });
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

    const billingProfile = useMemo(() => {
        const a = authUser && typeof authUser === "object" ? authUser : {};
        const s = userProfile && typeof userProfile === "object" ? userProfile : {};
        const q = profileFromQuery && typeof profileFromQuery === "object" ? profileFromQuery : {};
        return { ...a, ...s, ...q };
    }, [authUser, userProfile, profileFromQuery]);

    const billingSlug = slugFromProfile(billingProfile);
    const packageKeyForFeatures = normalizePaidPackageKey(billingProfile);
    const canGate =
        Boolean(billingSlug) || (!appStoreLoading && !profileQueryPending);
    if (canGate && !hasFeature(packageKeyForFeatures, "quotes")) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <UpgradePrompt
                    featureKey="quotes"
                    title="Quotes aren’t on your current plan"
                    description="Quotes are included on Starter, Business, and Growth. Pick a tier and pay with PayFast to unlock."
                />
            </div>
        );
    }

    return (
        <DocListLockShell
            header={
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="responsive-page-header"
                >
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-semibold text-foreground font-display truncate">Quotes</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Create, manage, and track your project quotations.
                        </p>
                    </div>
                    <div className="responsive-page-header-actions gap-2.5">
                        <input
                            type="file"
                            name="quotes_import_csv"
                            ref={quoteFileInputRef}
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportQuotesFile}
                        />
                        {/* Primary action first on mobile */}
                        <Link to={createPageUrl("CreateQuote")} className="order-first sm:order-none w-full md:w-auto">
                            <Button className="responsive-btn h-10 w-full gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-[1px] hover:bg-primary/90 hover:shadow-md md:w-auto touch-manipulation">
                                <Plus className="w-4 h-4" />
                                Create Quote
                            </Button>
                        </Link>

                        {/* View toggle */}
                        <div className="hidden h-10 shrink-0 items-center rounded-xl border border-border bg-muted/50 p-1 shadow-sm sm:flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('grid')}
                                className={`h-8 w-8 rounded-lg shrink-0 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewMode('list')}
                                className={`h-8 w-8 rounded-lg shrink-0 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
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
                                    className="h-10 min-w-[44px] rounded-xl border-border bg-background/80 shadow-sm backdrop-blur-sm sm:hidden touch-manipulation"
                                    aria-label="More actions"
                                >
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
                        <div className="hidden items-center gap-2 rounded-xl border border-border bg-muted/40 p-1.5 shadow-sm sm:flex">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleImportQuotes}
                                disabled={isImporting}
                                className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none"
                            >
                                <Upload className={`w-4 h-4 mr-2 ${isImporting ? "animate-pulse" : ""}`} />
                                {isImporting ? "Importing…" : "Import CSV"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportQuotes}
                                disabled={sortedQuotes.length === 0}
                                className="h-10 rounded-lg border-border bg-background px-3.5 font-medium shadow-none"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export CSV
                            </Button>
                        </div>
                        <Link to={createPageUrl("QuoteTemplates")} className="flex-1 sm:flex-none">
                            <Button variant="outline" className="h-10 w-full rounded-xl border-border bg-background/80 px-3.5 font-medium shadow-sm backdrop-blur-sm sm:w-auto">
                                <FileText className="w-4 h-4 mr-2" />
                                Templates
                            </Button>
                        </Link>
                    </div>
                </motion.div>
            }
            toolbar={
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by quote number, client, or project..."
                                className="h-10 w-full rounded-xl pl-10"
                            />
                        </div>
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="h-10 w-full sm:w-[180px]">
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
                    {hasNextPage && (
                        <p className="text-xs text-muted-foreground">
                            Search applies to quotes loaded so far. Scroll the list to load older quotes.
                        </p>
                    )}
                </div>
            }
            footer={sortedQuotes.length > 0 ? (
                <div className="px-3 py-2 md:px-4">
                    {(hasNextPage || isFetchingNextPage) && (
                        <div
                            ref={quotesLoadMoreRef}
                            className="mb-2 flex min-h-[40px] flex-col items-center justify-center gap-1"
                            aria-live="polite"
                        >
                            {isFetchingNextPage ? (
                                <span className="text-sm text-muted-foreground">Loading more quotes…</span>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    More quotes available — scroll the list to load older rows
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
                        totalItems={sortedQuotes.length}
                        itemLabel="quotes"
                    />
                </div>
            ) : null}
        >
            {initialError && (
                <div className="m-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
                    <p className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
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
                viewMode === "list" ? (
                    <QuoteList isLoading={true} />
                ) : (
                    <QuoteGrid isLoading={true} />
                )
            ) : sortedQuotes.length === 0 ? (
                <div className="p-6 md:p-10">
                    <EmptyState
                        icon={<FileText className="h-7 w-7 text-muted-foreground" />}
                        title="No quotes yet"
                        description="Send professional quotes in ZAR or any currency. Convert to invoices when approved."
                        action={
                            <Link to={createPageUrl("CreateQuote")}>
                                <Button className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                                    Create your first quote
                                </Button>
                            </Link>
                        }
                    />
                </div>
            ) : viewMode === "list" ? (
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
        </DocListLockShell>
    );
}