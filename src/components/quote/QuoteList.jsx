import React, { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const ROW_HEIGHT = 64;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

// Quotes grid: Quote # | Client | Project | Amount | Valid Until | Status | Actions (7 cols)
const GRID_TOTAL_WIDTH = 220 + 160 + 220 + 140 + 140 + 120 + 60; // 1060

const QuoteRow = React.memo(function QuoteRow({ quote, clientName, userCurrency, client, onActionSuccess, onRowClick, style }) {
    const handleRowClick = useCallback(() => onRowClick?.(quote), [quote, onRowClick]);
    const stopActions = useCallback((e) => e.stopPropagation(), []);
    return (
        <TableRow
            className="quote-table-row border-0 absolute inset-x-0 w-full quote-list-row cursor-pointer hover:bg-muted/50"
            style={style}
            onClick={handleRowClick}
        >
            <TableCell className="text-left font-medium text-foreground text-xs sm:text-sm whitespace-nowrap truncate">{quote.quote_number}</TableCell>
            <TableCell className="text-left text-muted-foreground text-xs sm:text-sm truncate">{clientName}</TableCell>
            <TableCell className="text-left text-muted-foreground text-xs sm:text-sm truncate">{quote.project_title}</TableCell>
            <TableCell className="amount font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap">{formatCurrency(quote.total_amount, userCurrency)}</TableCell>
            <TableCell className="text-center text-muted-foreground text-xs sm:text-sm whitespace-nowrap">{quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : "N/A"}</TableCell>
            <TableCell className="text-center">
                <QuoteStatusBadge status={quote.status} />
            </TableCell>
            <TableCell className="text-center" onClick={stopActions}>
                <div className="flex justify-center">
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
                    <TableCell colSpan={7} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
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

    const colgroup = (
        <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 60 }} />
        </colgroup>
    );
    const headerRow = (
        <TableRow className="quote-table-row hover:bg-transparent border-0 bg-background sticky top-0 z-10">
            <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Quote #</TableHead>
            <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client</TableHead>
            <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Project Title</TableHead>
            <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Valid Until</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
            <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
        </TableRow>
    );

    return (
        <div className="overflow-hidden rounded-lg border border-border/50 bg-transparent w-full min-w-0">
            <div className="overflow-x-auto">
                {isLoading ? (
                    <Table className="table quote-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
                        {colgroup}
                        <TableHeader>
                            {headerRow}
                        </TableHeader>
                        <TableBody>
                            {Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="quote-table-row border-0">
                                    <TableCell><Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[120px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" /></TableCell>
                                    <TableCell className="amount"><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse ml-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-full max-w-[80px] rounded-full animate-pulse" /></TableCell>
                                    <TableCell><div className="flex justify-center"><Skeleton className="h-8 w-8 rounded-lg animate-pulse" /></div></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : quotes.length === 0 ? (
                    <Table className="table quote-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
                        {colgroup}
                        <TableHeader>
                            {headerRow}
                        </TableHeader>
                        <TableBody>
                            <TableRow className="quote-table-row border-0">
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No quotes yet</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                ) : (
                    <div
                        ref={parentRef}
                        className="overflow-auto overflow-x-auto"
                        style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT, minWidth: GRID_TOTAL_WIDTH }}
                    >
                        <Table className="table quote-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
                            {colgroup}
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
                <DialogContent className="sm:max-w-md" aria-describedby="quote-details-timeline">
                    <DialogHeader>
                        <DialogTitle>Quote Details</DialogTitle>
                    </DialogHeader>
                    {detailsQuote && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">#{detailsQuote.quote_number}</span>
                                <span>{getClientName(detailsQuote.client_id)}</span>
                                <span>{formatCurrency(detailsQuote.total_amount, userCurrency)}</span>
                            </div>
                            <div id="quote-details-timeline">
                                <QuoteStatusTracker status={detailsQuote.status} />
                            </div>
                            <Button className="w-full" onClick={handleOpenFullQuote}>
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