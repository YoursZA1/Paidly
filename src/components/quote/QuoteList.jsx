import React, { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import QuoteActions from "./QuoteActions";
import QuoteStatusTracker from "./QuoteStatusTracker";

const ROW_HEIGHT = 52;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

const QuoteRow = React.memo(function QuoteRow({ quote, clientName, userCurrency, client, onActionSuccess, style }) {
    return (
        <TableRow className="hover:bg-slate-50 absolute inset-x-0 w-full border-border" style={style}>
            <TableCell className="font-medium">{quote.quote_number}</TableCell>
            <TableCell>{clientName}</TableCell>
            <TableCell>{quote.project_title}</TableCell>
            <TableCell>{formatCurrency(quote.total_amount, userCurrency)}</TableCell>
            <TableCell>{quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : "N/A"}</TableCell>
            <TableCell>
                <QuoteStatusTracker status={quote.status} />
            </TableCell>
            <TableCell className="text-right">
                <QuoteActions quote={quote} client={client} onActionSuccess={onActionSuccess} />
            </TableCell>
        </TableRow>
    );
});

const VirtualizedQuoteTableBody = React.memo(function VirtualizedQuoteTableBody({ quotes, parentRef, getClientName, userCurrency, clients, onActionSuccess }) {
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
    const getClientName = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    }, [clients]);

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                {isLoading ? (
                    <Table className="min-w-[800px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Quote #</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Project Title</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Valid Until</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array(5).fill(0).map((_, i) => (
                                <TableRow key={i}><td colSpan={7}><Skeleton className="h-12 w-full" /></td></TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : quotes.length === 0 ? (
                    <Table className="min-w-[800px]">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Quote #</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Project Title</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Valid Until</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No quotes yet</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                ) : (
                    <div
                        ref={parentRef}
                        className="overflow-auto overflow-x-auto min-w-[800px]"
                        style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT }}
                    >
                        <Table className="min-w-[800px] table-fixed">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-border bg-card sticky top-0 z-10">
                                    <TableHead>Quote #</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Project Title</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Valid Until</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody style={{ position: "relative" }}>
                                <VirtualizedQuoteTableBody
                                    quotes={quotes}
                                    parentRef={parentRef}
                                    getClientName={getClientName}
                                    userCurrency={userCurrency}
                                    clients={clients}
                                    onActionSuccess={onActionSuccess}
                                />
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default React.memo(QuoteList);