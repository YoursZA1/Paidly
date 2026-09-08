import React, { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PartialPaymentIndicator from "../payments/PartialPaymentIndicator";
import { createPageUrl } from "@/utils";
import { useDocumentTableDensity } from "@/hooks/useDocumentTableDensity";
import { documentNumericClass, documentRowCellClass } from "@/lib/documentTableClasses";
import { cn } from "@/lib/utils";
import InvoiceListPaymentActions from "./InvoiceListPaymentActions";

const InvoiceRow = React.memo(function InvoiceRow({
    invoice,
    density,
    getClientName,
    getTotalPaid,
    userCurrency,
    client,
    onActionSuccess,
    onPaymentFullyPaid,
    onOptimisticUpdate,
}) {
    const totalPaid = getTotalPaid(invoice.id);
    const clientName = getClientName(invoice.client_id);
    const issuedDate = invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : "—";
    const viewHref = createPageUrl(`ViewDocument/invoice/${invoice.id}`);
    return (
        <TableRow className="group border-b border-border/40 hover:bg-muted/50">
            <TableCell className={documentRowCellClass(density, "min-w-0 px-4")}>
                <Link to={viewHref} className="block min-w-0 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    <p className="truncate text-sm font-medium text-foreground">{clientName}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {invoice.invoice_number || invoice.project_title || "—"}
                    </p>
                    {invoice.source_quote_id ? (
                        <p className="truncate text-[11px] text-muted-foreground/80">Created from quote</p>
                    ) : null}
                </Link>
            </TableCell>
            <TableCell className={documentRowCellClass(density, documentNumericClass("px-4 font-medium text-foreground"))}>
                <div className="flex flex-col items-end gap-0.5">
                    <span>{formatCurrency(invoice.total_amount, userCurrency)}</span>
                    {totalPaid > 0 ? (
                        <PartialPaymentIndicator invoice={invoice} totalPaid={totalPaid} currency={userCurrency} size="compact" />
                    ) : null}
                </div>
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-4")}>
                <InvoiceStatusBadge status={invoice.status || "draft"} invoice={invoice} compact />
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-4 text-muted-foreground whitespace-nowrap")}>
                {issuedDate}
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-3")}>
                <InvoiceListPaymentActions invoice={invoice} onActionSuccess={onActionSuccess} />
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-3")}>
                <div className="flex items-center justify-end gap-1">
                    <InvoiceActions
                        invoice={invoice}
                        client={client}
                        onActionSuccess={onActionSuccess}
                        onPaymentFullyPaid={onPaymentFullyPaid}
                        onOptimisticUpdate={onOptimisticUpdate}
                        compactTrigger
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
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-2xl border border-border/50 bg-card">
            <Link
                to={createPageUrl(`ViewDocument/invoice/${invoice.id}`)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 transition-colors active:bg-muted/50"
            >
                <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium text-foreground">{clientName}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">{invoice.invoice_number}</p>
                    {invoice.source_quote_id ? (
                        <p className="truncate text-[11px] text-muted-foreground/80">Created from quote</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground/80">{issuedDate}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">{amountLabel}</span>
                    {totalPaid > 0 ? (
                        <PartialPaymentIndicator invoice={invoice} totalPaid={totalPaid} currency={userCurrency} size="compact" />
                    ) : null}
                    <InvoiceStatusBadge status={invoice.status || "draft"} invoice={invoice} compact />
                </div>
            </Link>
            <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-border/50 px-2" onClick={(e) => e.preventDefault()}>
                <InvoiceListPaymentActions invoice={invoice} onActionSuccess={onActionSuccess} />
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

function InvoiceList({ invoices, clients = [], isLoading, userCurrency, paymentsMap, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate, density: densityProp }) {
    const densityState = useDocumentTableDensity();
    const density = densityProp || densityState.density;

    const getClientName = useCallback((clientId) => {
        const client = clients.find((c) => c.id === clientId);
        return client ? client.name : "N/A";
    }, [clients]);

    const getTotalPaid = useCallback((invoiceId) => {
        const payments = paymentsMap?.get(invoiceId) || [];
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    }, [paymentsMap]);

    const clientMap = useMemo(() => new Map((clients || []).map((c) => [c.id, c])), [clients]);
    const rows = invoices || [];

    const header = (
        <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border/50">
            <TableRow className="border-b border-border/50 hover:bg-transparent">
                <TableHead className="h-9 px-4 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Client
                </TableHead>
                <TableHead className={cn("h-9 w-32 px-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground", documentNumericClass())}>
                    Amount
                </TableHead>
                <TableHead className="h-9 w-28 px-4 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Status
                </TableHead>
                <TableHead className="h-9 w-28 px-4 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Date
                </TableHead>
                <TableHead className="h-9 w-32 px-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Payment
                </TableHead>
                <TableHead className="h-9 w-16 px-3 text-right">
                    <span className="sr-only">Actions</span>
                </TableHead>
            </TableRow>
        </TableHeader>
    );

    return (
        <div className="w-full min-w-0">
            <div className="space-y-3 md:hidden">
                {isLoading
                    ? Array(6).fill(0).map((_, i) => (
                        <div key={i} className="flex items-center justify-between rounded-2xl border border-border/50 px-4 py-3">
                            <div className="space-y-1.5">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                            <Skeleton className="h-4 w-16" />
                        </div>
                    ))
                    : rows.map((invoice) => (
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
                    ))}
            </div>

            <div className="hidden md:block">
                <Table
                    containerClassName="overflow-visible"
                    className={cn("min-w-[640px]", density === "compact" && "text-sm")}
                >
                    {header}
                    <TableBody>
                        {isLoading
                            ? Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="border-b border-border/40 hover:bg-transparent">
                                    <TableCell className={documentRowCellClass(density, "px-4")}><Skeleton className="h-4 w-40" /></TableCell>
                                    <TableCell className={documentRowCellClass(density, documentNumericClass("px-4"))}><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                                    <TableCell className={documentRowCellClass(density, "px-4")}><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                                    <TableCell className={documentRowCellClass(density, "px-4")}><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell className={documentRowCellClass(density, "px-3")}><Skeleton className="ml-auto h-8 w-16 rounded-lg" /></TableCell>
                                    <TableCell className={documentRowCellClass(density, "px-3")}><Skeleton className="ml-auto h-8 w-8 rounded-lg" /></TableCell>
                                </TableRow>
                            ))
                            : rows.map((invoice) => (
                                <InvoiceRow
                                    key={invoice.id}
                                    invoice={invoice}
                                    density={density}
                                    getClientName={getClientName}
                                    getTotalPaid={getTotalPaid}
                                    userCurrency={userCurrency}
                                    client={clientMap.get(invoice.client_id) ?? null}
                                    onActionSuccess={onActionSuccess}
                                    onPaymentFullyPaid={onPaymentFullyPaid}
                                    onOptimisticUpdate={onOptimisticUpdate}
                                />
                            ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export default React.memo(InvoiceList);
