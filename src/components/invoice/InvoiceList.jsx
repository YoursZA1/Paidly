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
import { Button } from "@/components/ui/button";
import { CheckCircle2, Pencil } from "lucide-react";
import { Invoice } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { useDocumentTableDensity } from "@/hooks/useDocumentTableDensity";
import { documentNumericClass, documentRowCellClass } from "@/lib/documentTableClasses";
import { cn } from "@/lib/utils";

const QuickActionButtons = React.memo(function QuickActionButtons({ invoice, onMarkPaid }) {
    const isPaid = ["paid", "cancelled"].includes(String(invoice?.status || "").toLowerCase());
    return (
        <div className="flex items-center justify-end gap-0.5">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Link to={createPageUrl(`EditInvoice?id=${invoice.id}`)} aria-label="Edit invoice">
                    <Pencil className="h-4 w-4" />
                </Link>
            </Button>
            {!isPaid ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-status-paid"
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
    onMarkPaid,
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
                <InvoiceStatusBadge status={invoice.status || "draft"} compact />
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-4 text-muted-foreground whitespace-nowrap")}>
                {issuedDate}
            </TableCell>
            <TableCell className={documentRowCellClass(density, "px-3")}>
                <div className="flex items-center justify-end gap-1">
                    <div className="hidden md:flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <QuickActionButtons invoice={invoice} onMarkPaid={onMarkPaid} />
                    </div>
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
                    <p className="text-[11px] text-muted-foreground/80">{issuedDate}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">{amountLabel}</span>
                    {totalPaid > 0 ? (
                        <PartialPaymentIndicator invoice={invoice} totalPaid={totalPaid} currency={userCurrency} size="compact" />
                    ) : null}
                    <InvoiceStatusBadge status={invoice.status || "draft"} compact />
                </div>
            </Link>
            <div className="flex shrink-0 items-center border-l border-border/50" onClick={(e) => e.preventDefault()}>
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
    const { toast } = useToast();
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
                <TableHead className="h-9 w-28 px-3 text-right">
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
                                    onMarkPaid={handleMarkAsPaidQuick}
                                />
                            ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

export default React.memo(InvoiceList);
