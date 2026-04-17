import React, { useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PartialPaymentIndicator from "../payments/PartialPaymentIndicator";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle2, Pencil } from "lucide-react";
import { Invoice } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";

const ROW_HEIGHT = 64;
const VIRTUAL_TABLE_MAX_HEIGHT = 480;
const GRID_TEMPLATE = "minmax(0,2.8fr) minmax(110px,1fr) minmax(120px,0.95fr) minmax(120px,1fr) 160px";

const QuickActionButtons = React.memo(function QuickActionButtons({ invoice, onMarkPaid }) {
    const isPaid = ["paid", "cancelled"].includes(String(invoice?.status || "").toLowerCase());
    return (
        <div className="flex items-center justify-end gap-1">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <Link to={createPageUrl(`ViewDocument/invoice/${invoice.id}`)} aria-label="View invoice">
                    <Eye className="h-4 w-4" />
                </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                <Link to={createPageUrl(`EditInvoice?id=${invoice.id}`)} aria-label="Edit invoice">
                    <Pencil className="h-4 w-4" />
                </Link>
            </Button>
            {!isPaid ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-emerald-600 hover:text-emerald-700"
                    onClick={() => onMarkPaid(invoice)}
                    aria-label="Mark invoice as paid"
                    title="Mark as paid"
                >
                    <CheckCircle2 className="h-4 w-4" />
                </Button>
            ) : null}
        </div>
    );
});

const InvoiceRow = React.memo(function InvoiceRow({ invoice, virtualRow, getClientName, getTotalPaid, userCurrency, client, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate, onMarkPaid }) {
    const totalPaid = getTotalPaid(invoice.id);
    const clientName = getClientName(invoice.client_id);
    const issuedDate = invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : "N/A";
    return (
        <TableRow
            className="table-row group border-0 absolute inset-x-0 w-full invoice-list-row"
            style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                top: 0,
                display: "grid",
                gridTemplateColumns: GRID_TEMPLATE,
            }}
        >
            <TableCell className="invoice-col-main text-left min-w-0">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">{invoice.project_title || invoice.invoice_number}</p>
                </div>
            </TableCell>
            <TableCell className="amount invoice-col-amount font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap">
                {formatCurrency(invoice.total_amount, userCurrency)}
            </TableCell>
            <TableCell className="invoice-col-status text-center">
                <InvoiceStatusBadge status={invoice.status || "draft"} />
            </TableCell>
            <TableCell className="invoice-col-date text-center text-muted-foreground text-xs sm:text-sm whitespace-nowrap">
                {issuedDate}
            </TableCell>
            <TableCell className="invoice-col-actions text-right">
                <div className="flex items-center justify-end gap-1">
                    <div className="hidden lg:block opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <QuickActionButtons invoice={invoice} onMarkPaid={onMarkPaid} />
                    </div>
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
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex items-stretch gap-0 min-w-0 shadow-sm">
            <Link
                to={createPageUrl(`ViewDocument/invoice/${invoice.id}`)}
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
    onMarkPaid,
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
                    <TableCell colSpan={5} className="!p-0 !border-0 !h-0" style={{ height: `${totalSize}px`, lineHeight: 0, overflow: "hidden" }} />
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
                        onMarkPaid={onMarkPaid}
                    />
                );
            })}
        </>
    );
});

function InvoiceList({ invoices, clients, isLoading, userCurrency, paymentsMap, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate }) {
    const parentRef = useRef(null);
    const { toast } = useToast();

    const getClientName = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    }, [clients]);

    const getTotalPaid = useCallback((invoiceId) => {
        const payments = paymentsMap?.get(invoiceId) || [];
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    }, [paymentsMap]);

    const handleMarkAsPaidQuick = useCallback(async (invoice) => {
        try {
            await Invoice.update(invoice.id, { status: "paid" });
            onActionSuccess?.();
            onPaymentFullyPaid?.();
            toast({
                title: "Marked as paid",
                description: `Invoice ${invoice.invoice_number || ""} updated successfully.`,
                variant: "success",
            });
        } catch (error) {
            toast({
                title: "Could not update invoice",
                description: error?.message || "Try again in a moment.",
                variant: "destructive",
            });
        }
    }, [onActionSuccess, onPaymentFullyPaid, toast]);

    const clientMap = useMemo(() => new Map((clients || []).map((c) => [c.id, c])), [clients]);

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
                            client={clientMap.get(invoice.client_id) ?? null}
                            onActionSuccess={onActionSuccess}
                            onPaymentFullyPaid={onPaymentFullyPaid}
                            onOptimisticUpdate={onOptimisticUpdate}
                        />
                    ))
                )}
            </div>

            {/* Desktop: virtualized table view */}
            <div className="hidden md:block">
                {isLoading ? (
                    <Table className="table invoice-list-table table-fixed w-full">
                        <TableHeader>
                            <TableRow className="table-row hover:bg-transparent border-0" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
                                <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client / Title</TableHead>
                                <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
                                <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="table-row border-0" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[220px] rounded animate-pulse" /></TableCell>
                                    <TableCell className="amount"><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse ml-auto" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-full max-w-[80px] rounded-full animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-full max-w-[100px] rounded animate-pulse" /></TableCell>
                                    <TableCell><div className="flex justify-center"><Skeleton className="h-8 w-8 rounded-lg animate-pulse" /></div></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : invoices.length === 0 ? null : (
                    <div
                        ref={parentRef}
                        className="overflow-auto"
                        style={{ maxHeight: VIRTUAL_TABLE_MAX_HEIGHT }}
                    >
                        <Table className="table invoice-list-table table-fixed w-full">
                            <TableHeader>
                                <TableRow className="table-row hover:bg-transparent border-0 bg-background sticky top-0 z-10" style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
                                    <TableHead className="text-left text-muted-foreground text-xs font-medium whitespace-nowrap">Client / Title</TableHead>
                                    <TableHead className="amount text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                                    <TableHead className="text-center text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
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
                                    onMarkPaid={handleMarkAsPaidQuick}
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