import React, { useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import { Progress } from "@/components/ui/progress";
import PartialPaymentIndicator from "../payments/PartialPaymentIndicator";
import { createPageUrl } from "@/utils";

const ROW_HEIGHT = 64;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;

// Fixed grid: Invoice # | Client | Project | Amount | Paid | Date | Status | Actions
const GRID_TOTAL_WIDTH = 220 + 160 + 220 + 140 + 140 + 140 + 120 + 60; // 1200

const InvoiceRow = React.memo(function InvoiceRow({ invoice, virtualRow, getClientName, getTotalPaid, userCurrency, client, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate }) {
    const totalPaid = getTotalPaid(invoice.id);
    const totalAmount = Number(invoice.total_amount) || 0;
    const paidPercentage = totalAmount > 0 ? Math.min(100, (totalPaid / totalAmount) * 100) : 0;
    return (
        <TableRow
            className="table-row border-0 absolute inset-x-0 w-full invoice-list-row"
            style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                top: 0,
            }}
        >
            <TableCell className="invoice-col-num text-left font-medium text-foreground text-xs sm:text-sm whitespace-nowrap truncate">
                {invoice.invoice_number}
            </TableCell>
            <TableCell className="invoice-col-client text-left text-muted-foreground text-xs sm:text-sm truncate">
                {getClientName(invoice.client_id)}
            </TableCell>
            <TableCell className="invoice-col-project text-left text-muted-foreground text-xs sm:text-sm truncate">
                {invoice.project_title}
            </TableCell>
            <TableCell className="amount invoice-col-amount font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap">
                {formatCurrency(invoice.total_amount, userCurrency)}
            </TableCell>
            <TableCell className="invoice-col-paid text-center whitespace-nowrap">
                <div className="paid-cell">
                    {paidPercentage > 0 ? (
                        <>
                            <Progress value={paidPercentage} className="h-1.5 w-12 shrink-0" />
                            <span className="text-xs tabular-nums">{paidPercentage.toFixed(0)}%</span>
                        </>
                    ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">0%</span>
                    )}
                </div>
            </TableCell>
            <TableCell className="invoice-col-date text-center text-muted-foreground text-xs sm:text-sm whitespace-nowrap">
                {invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : "N/A"}
            </TableCell>
            <TableCell className="invoice-col-status text-center">
                <InvoiceStatusBadge status={invoice.status || "draft"} />
            </TableCell>
            <TableCell className="invoice-col-actions text-center">
                <div className="flex justify-center">
                    <InvoiceActions
                    invoice={invoice}
                    client={client}
                    onActionSuccess={onActionSuccess}
                    onPaymentFullyPaid={onPaymentFullyPaid}
                    onOptimisticUpdate={onOptimisticUpdate}
                    />
                </div>
            </TableCell>
        </TableRow>
    );
});

const InvoiceMobileCard = React.memo(function InvoiceMobileCard({ invoice, totalPaid, clientName, userCurrency, client, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate }) {
    const issuedDate = invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : "—";
    const amountLabel = formatCurrency(invoice.total_amount, userCurrency);
    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex items-stretch gap-0 min-w-0">
            <Link
                to={createPageUrl(`ViewInvoice?id=${invoice.id}`)}
                className="flex-1 min-w-0 flex justify-between items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors"
            >
                <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{clientName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{invoice.invoice_number}</p>
                    <p className="text-[10px] text-muted-foreground/80">{issuedDate}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-bold text-foreground text-sm currency-nums whitespace-nowrap">{amountLabel}</span>
                    {totalPaid > 0 ? (
                        <PartialPaymentIndicator invoice={invoice} totalPaid={totalPaid} currency={userCurrency} size="compact" />
                    ) : (
                        <span className="text-[10px] text-muted-foreground">No payments</span>
                    )}
                    <InvoiceStatusBadge status={invoice.status || "draft"} />
                </div>
            </Link>
            <div className="flex items-center border-l border-border shrink-0" onClick={(e) => e.preventDefault()}>
                <InvoiceActions
                    invoice={invoice}
                    client={client}
                    onActionSuccess={onActionSuccess}
                    onPaymentFullyPaid={onPaymentFullyPaid}
                    onOptimisticUpdate={onOptimisticUpdate}
                />
            </div>
        </div>
    );
});

const VirtualizedTableBody = React.memo(function VirtualizedTableBody({
    invoices,
    parentRef,
    getClientName,
    getTotalPaid,
    userCurrency,
    clients,
    onActionSuccess,
    onPaymentFullyPaid,
    onOptimisticUpdate,
}) {
    const rowVirtualizer = useVirtualizer({
        count: invoices.length,
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
                    <TableCell colSpan={8} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
                </TableRow>
            )}
            {virtualRows.map((virtualRow) => {
                const invoice = invoices[virtualRow.index];
                const client = clients.find((c) => c.id === invoice.client_id) ?? null;
                return (
                    <InvoiceRow
                        key={invoice.id}
                        invoice={invoice}
                        virtualRow={virtualRow}
                        getClientName={getClientName}
                        getTotalPaid={getTotalPaid}
                        userCurrency={userCurrency}
                        client={client}
                        onActionSuccess={onActionSuccess}
                        onPaymentFullyPaid={onPaymentFullyPaid}
                        onOptimisticUpdate={onOptimisticUpdate}
                    />
                );
            })}
        </>
    );
});

const statusStyles = {
    draft: "bg-muted text-muted-foreground border-border",
    sent: "bg-primary/15 text-primary border-primary/20",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    partial_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    overdue: "bg-red-100 text-red-700 border-red-200"
};

function InvoiceList({ invoices, clients, isLoading, userCurrency, paymentsMap, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate }) {
    const parentRef = useRef(null);

    const getClientName = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    }, [clients]);

    const getTotalPaid = useCallback((invoiceId) => {
        const payments = paymentsMap?.get(invoiceId) || [];
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    }, [paymentsMap]);

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
                ) : (
                    invoices.map((invoice) => (
                        <InvoiceMobileCard
                            key={invoice.id}
                            invoice={invoice}
                            totalPaid={getTotalPaid(invoice.id)}
                            clientName={getClientName(invoice.client_id)}
                            userCurrency={userCurrency}
                            client={clients.find((c) => c.id === invoice.client_id) ?? null}
                            onActionSuccess={onActionSuccess}
                            onPaymentFullyPaid={onPaymentFullyPaid}
                            onOptimisticUpdate={onOptimisticUpdate}
                        />
                    ))
                )}
            </div>

            {/* Desktop: virtualized table view */}
            <div className="hidden md:block overflow-x-auto mobile-scroll-x">
                {isLoading ? (
                    <Table className="table invoice-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
                        <colgroup>
                            <col style={{ width: 220 }} />
                            <col style={{ width: 160 }} />
                            <col style={{ width: 220 }} />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 60 }} />
                        </colgroup>
                        <TableHeader>
                            <TableRow className="table-row hover:bg-transparent border-0">
                                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Invoice #</TableHead>
                                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client</TableHead>
                                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Project Title</TableHead>
                                <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Paid</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="table-row border-0">
                                    <TableCell><Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[120px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[180px] rounded animate-pulse" /></TableCell>
                                    <TableCell className="amount"><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse ml-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-full max-w-[80px] rounded-full animate-pulse" /></TableCell>
                                    <TableCell><div className="flex justify-center"><Skeleton className="h-8 w-8 rounded-lg animate-pulse" /></div></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : invoices.length === 0 ? null : (
                    <div
                        ref={parentRef}
                        className="overflow-auto overflow-x-auto"
                        style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT, minWidth: GRID_TOTAL_WIDTH }}
                    >
                        <Table className="table invoice-list-table table-fixed" style={{ width: GRID_TOTAL_WIDTH, minWidth: GRID_TOTAL_WIDTH }}>
                            <colgroup>
                                <col style={{ width: 220 }} />
                                <col style={{ width: 160 }} />
                                <col style={{ width: 220 }} />
                                <col style={{ width: 140 }} />
                                <col style={{ width: 140 }} />
                                <col style={{ width: 140 }} />
                                <col style={{ width: 120 }} />
                                <col style={{ width: 60 }} />
                            </colgroup>
                            <TableHeader>
                                <TableRow className="table-row hover:bg-transparent border-0 bg-background sticky top-0 z-10">
                                    <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Invoice #</TableHead>
                                    <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client</TableHead>
                                    <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Project Title</TableHead>
                                    <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Paid</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody style={{ position: "relative" }}>
                                <VirtualizedTableBody
                                    invoices={invoices}
                                    parentRef={parentRef}
                                    getClientName={getClientName}
                                    getTotalPaid={getTotalPaid}
                                    userCurrency={userCurrency}
                                    clients={clients}
                                    onActionSuccess={onActionSuccess}
                                    onPaymentFullyPaid={onPaymentFullyPaid}
                                    onOptimisticUpdate={onOptimisticUpdate}
                                />
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default React.memo(InvoiceList);