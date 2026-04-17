import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import { createPageUrl } from "@/utils";
import QuoteActions from "./QuoteActions";
import QuoteStatusBadge from "./QuoteStatusBadge";
import QuoteStatusTracker from "./QuoteStatusTracker";
import { Eye, Pencil, ArrowRightSquare } from "lucide-react";

const ROW_HEIGHT = 64;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;
const GRID_TEMPLATE = "minmax(0,2.8fr) minmax(110px,1fr) minmax(120px,0.95fr) minmax(120px,1fr) 160px";

const QuoteQuickActions = React.memo(function QuoteQuickActions({ quote }) {
    return (
        <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <Link to={createPageUrl(`ViewQuote?id=${quote.id}`)} aria-label="View quote">
                    <Eye className="h-4 w-4" />
                </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <Link to={createPageUrl(`EditQuote?id=${quote.id}`)} aria-label="Edit quote">
                    <Pencil className="h-4 w-4" />
                </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <Link to={createPageUrl(`CreateInvoice?quoteId=${quote.id}`)} aria-label="Convert to invoice">
                    <ArrowRightSquare className="h-4 w-4" />
                </Link>
            </Button>
        </div>
    );
});

const QuoteRow = React.memo(function QuoteRow({ quote, clientName, userCurrency, client, onActionSuccess, onRowClick, style }) {
    const handleRowClick = useCallback(() => onRowClick?.(quote), [quote, onRowClick]);
    const stopActions = useCallback((e) => e.stopPropagation(), []);
    const validUntil = quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : "N/A";
    return (
        <TableRow
            className="quote-table-row group border-0 absolute inset-x-0 w-full quote-list-row cursor-pointer hover:bg-muted/50"
            style={{ ...style, display: "grid", gridTemplateColumns: GRID_TEMPLATE }}
            onClick={handleRowClick}
        >
            <TableCell className="text-left min-w-0">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">{quote.project_title || quote.quote_number}</p>
                </div>
            </TableCell>
            <TableCell className="amount font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap">{formatCurrency(quote.total_amount, userCurrency)}</TableCell>
            <TableCell className="text-center">
                <QuoteStatusBadge status={quote.status} />
            </TableCell>
            <TableCell className="text-center text-muted-foreground text-xs sm:text-sm whitespace-nowrap">{validUntil}</TableCell>
            <TableCell className="text-center" onClick={stopActions}>
                <div className="flex items-center justify-end gap-1">
                    <div className="hidden lg:block opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <QuoteQuickActions quote={quote} />
                    </div>
                    <QuoteActions quote={quote} client={client} onActionSuccess={onActionSuccess} />
                </div>
            </TableCell>
        </TableRow>
    );
});

const VirtualizedQuoteTableBody = React.memo(function VirtualizedQuoteTableBody({ quotes, parentRef, getClientName, userCurrency, clients, onActionSuccess, onRowClick }) {
    const rowVirtualizer = useVirtualizer({
        count: quotes.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();

    return (
        <>
            {totalSize > 0 && (
                <TableRow className="border-0 [&>td]:p-0 [&>td]:border-0" style={{ height: `${totalSize}px` }} aria-hidden>
                    <TableCell colSpan={5} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
                </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
                const quote = quotes[virtualRow.index];
                const client = clients.find((c) => c.id === quote.client_id) ?? null;
                return (
                    <QuoteRow
                        key={quote.id}
                        quote={quote}
                        clientName={getClientName(quote.client_id)}
                        userCurrency={userCurrency}
                        client={client}
                        onActionSuccess={onActionSuccess}
                        onRowClick={onRowClick}
                        style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                            top: 0,
                        }}
                    />
                );
            })}
        </>
    );
});

const QuoteMobileCard = React.memo(function QuoteMobileCard({ quote, clientName, userCurrency, client, onActionSuccess }) {
    const validUntil = quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : "—";
    const amountLabel = formatCurrency(quote.total_amount, userCurrency);
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex items-stretch gap-0 min-w-0">
            <button
                type="button"
                onClick={() => window.location.assign(createPageUrl(`ViewQuote?id=${quote.id}`))}
                className="flex-1 min-w-0 flex justify-between items-center gap-3 px-4 py-3 text-left active:bg-muted/50 transition-colors"
            >
                <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{clientName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{quote.quote_number}</p>
                    <p className="text-[10px] text-muted-foreground/80">Valid until {validUntil}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-bold text-foreground text-sm currency-nums whitespace-nowrap">{amountLabel}</span>
                    <QuoteStatusBadge status={quote.status} />
                </div>
            </button>
            <div className="flex items-center border-l border-border shrink-0" onClick={(e) => e.preventDefault()}>
                <QuoteActions quote={quote} client={client} onActionSuccess={onActionSuccess} />
            </div>
        </div>
    );
});

function QuoteList({ quotes, clients, isLoading, userCurrency, onActionSuccess }) {
    const parentRef = useRef(null);
    const navigate = useNavigate();
    const [detailsQuote, setDetailsQuote] = useState(null);
    const getClientName = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    }, [clients]);
    const handleRowClick = useCallback((quote) => setDetailsQuote(quote), []);
    const handleOpenFullQuote = useCallback(() => {
        if (detailsQuote) navigate(createPageUrl(`ViewQuote?id=${detailsQuote.id}`));
        setDetailsQuote(null);
    }, [detailsQuote, navigate]);
    const clientMap = useMemo(() => new Map((clients || []).map((c) => [c.id, c])), [clients]);
    const headerRow = (
        <TableRow className="quote-table-row hover:bg-transparent border-0 bg-background sticky top-0 z-10" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
            <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client / Title</TableHead>
            <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
        </TableRow>
    );

    return (
        <div className="overflow-hidden rounded-lg border border-border/50 bg-transparent w-full min-w-0">
            {/* Mobile: vertical card list */}
            <div className="block md:hidden p-3 sm:p-4 space-y-3">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div
                            key={i}
                            className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center gap-3"
                        >
                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                <Skeleton className="h-4 w-24 rounded" />
                                <Skeleton className="h-3 w-20 rounded" />
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <Skeleton className="h-4 w-20 rounded" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                        </div>
                    ))
                ) : quotes.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No quotes yet</div>
                ) : (
                    quotes.map((quote) => (
                        <QuoteMobileCard
                            key={quote.id}
                            quote={quote}
                            clientName={getClientName(quote.client_id)}
                            userCurrency={userCurrency}
                            client={clientMap.get(quote.client_id) ?? null}
                            onActionSuccess={onActionSuccess}
                        />
                    ))
                )}
            </div>

            {/* Desktop/tablet: virtualized table */}
            <div className="hidden md:block">
                {isLoading ? (
                    <Table className="table quote-list-table table-fixed w-full">
                        <TableHeader>
                            {headerRow}
                        </TableHeader>
                        <TableBody>
                            {Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="quote-table-row border-0" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[220px] rounded animate-pulse" /></TableCell>
                                    <TableCell className="amount"><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse ml-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-full max-w-[80px] rounded-full animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" /></TableCell>
                                    <TableCell><div className="flex justify-center"><Skeleton className="h-8 w-8 rounded-lg animate-pulse" /></div></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : quotes.length === 0 ? (
                    <Table className="table quote-list-table table-fixed w-full">
                        <TableHeader>
                            {headerRow}
                        </TableHeader>
                        <TableBody>
                            <TableRow className="quote-table-row border-0" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No quotes yet</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                ) : (
                    <div
                        ref={parentRef}
                        className="overflow-auto"
                        style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT }}
                    >
                        <Table className="table quote-list-table table-fixed w-full">
                            <TableHeader>
                                {headerRow}
                            </TableHeader>
                            <TableBody style={{ position: "relative" }}>
                                <VirtualizedQuoteTableBody
                                    quotes={quotes}
                                    parentRef={parentRef}
                                    getClientName={getClientName}
                                    userCurrency={userCurrency}
                                    clients={clients}
                                    onActionSuccess={onActionSuccess}
                                    onRowClick={handleRowClick}
                                />
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <Dialog open={!!detailsQuote} onOpenChange={(open) => !open && setDetailsQuote(null)}>
                <DialogContent className="sm:max-w-lg rounded-2xl border border-border bg-background p-0 shadow-xl" aria-describedby="quote-details-timeline">
                    <DialogHeader>
                        <DialogTitle className="px-6 pt-6 text-2xl font-semibold tracking-tight">Quote Details</DialogTitle>
                    </DialogHeader>
                    {detailsQuote && (
                        <div className="space-y-6 px-6 pb-6">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-muted-foreground">
                                <span className="font-semibold text-foreground">#{detailsQuote.quote_number}</span>
                                <span>{getClientName(detailsQuote.client_id)}</span>
                                <span className="font-medium text-foreground">{formatCurrency(detailsQuote.total_amount, userCurrency)}</span>
                            </div>
                            <div id="quote-details-timeline" className="rounded-xl border border-border bg-muted/20 p-4">
                                <QuoteStatusTracker status={detailsQuote.status} />
                            </div>
                            <Button
                                className="h-11 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-[1px] hover:bg-primary/90 hover:shadow-md"
                                onClick={handleOpenFullQuote}
                            >
                                View full quote
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default React.memo(QuoteList);