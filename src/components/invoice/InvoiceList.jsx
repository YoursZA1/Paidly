import React from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PartialPaymentIndicator from "../payments/PartialPaymentIndicator";
import { createPageUrl } from "@/utils";

const statusStyles = {
    draft: "bg-muted text-muted-foreground border-border",
    sent: "bg-primary/15 text-primary border-primary/20",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    partial_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    overdue: "bg-red-100 text-red-700 border-red-200"
};

export default function InvoiceList({ invoices, clients, isLoading, userCurrency, paymentsMap, onActionSuccess, onPaymentFullyPaid, onOptimisticUpdate }) {
    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const getTotalPaid = (invoiceId) => {
        const payments = paymentsMap?.get(invoiceId) || [];
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    };

    // Helper to get current balance for partial_paid invoices
    const getCurrentBalance = (invoice) => {
        const totalPaid = getTotalPaid(invoice.id);
        if (invoice.status === 'partial_paid') {
            return invoice.total_amount - totalPaid;
        }
        if (invoice.status === 'paid') {
            return 0;
        }
        return invoice.total_amount - totalPaid;
    };

    return (
        <div className="overflow-hidden rounded-xl border border-border w-full min-w-0">
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
                    invoices.map((invoice) => {
                        const totalPaid = getTotalPaid(invoice.id);
                        const clientName = getClientName(invoice.client_id);
                        const issuedDate = invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : "—";
                        const amountLabel = formatCurrency(invoice.total_amount, userCurrency);
                        return (
                            <div
                                key={invoice.id}
                                className="bg-card border border-border rounded-2xl overflow-hidden flex items-stretch gap-0 min-w-0"
                            >
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
                                        <span className="font-bold text-foreground text-sm currency-nums whitespace-nowrap">
                                            {amountLabel}
                                        </span>
                                        {totalPaid > 0 ? (
                                            <PartialPaymentIndicator
                                                invoice={invoice}
                                                totalPaid={totalPaid}
                                                currency={userCurrency}
                                                size="compact"
                                            />
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground">No payments</span>
                                        )}
                                        <InvoiceStatusBadge status={invoice.status || "draft"} size="small" />
                                    </div>
                                </Link>
                                <div className="flex items-center border-l border-border shrink-0" onClick={(e) => e.preventDefault()}>
                                    <InvoiceActions
                                        invoice={invoice}
                                        client={clients.find((c) => c.id === invoice.client_id)}
                                        onActionSuccess={onActionSuccess}
                                        onPaymentFullyPaid={onPaymentFullyPaid}
                                        onOptimisticUpdate={onOptimisticUpdate}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Desktop: table view */}
            <div className="hidden md:block overflow-x-auto mobile-scroll-x">
                <Table className="min-w-[640px] sm:min-w-[800px]">
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Invoice #</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Client</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Project Title</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Amount</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Paid</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Date</TableHead>
                            <TableHead className="text-muted-foreground text-xs font-medium whitespace-nowrap">Status</TableHead>
                            <TableHead className="text-right text-muted-foreground text-xs font-medium whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array(8).fill(0).map((_, i) => (
                                <TableRow key={i} className="border-border">
                                    <TableCell><Skeleton className="h-4 w-16 sm:w-20 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24 sm:w-32 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32 sm:w-48 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded animate-pulse" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-16 sm:w-20 rounded-full animate-pulse" /></TableCell>
                                    <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-lg animate-pulse" /></div></TableCell>
                                </TableRow>
                            ))
                        ) : (
                            invoices.map(invoice => {
                                const totalPaid = getTotalPaid(invoice.id);
                                return (
                                    <TableRow key={invoice.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="font-medium text-foreground text-xs sm:text-sm whitespace-nowrap">{invoice.invoice_number}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs sm:text-sm max-w-[120px] sm:max-w-none mobile-break-words">{getClientName(invoice.client_id)}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs sm:text-sm max-w-[140px] sm:max-w-none mobile-break-words">{invoice.project_title}</TableCell>
                                        <TableCell className="font-semibold text-foreground text-xs sm:text-sm whitespace-nowrap currency-nums">{formatCurrency(invoice.total_amount, userCurrency)}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {totalPaid > 0 ? (
                                                <PartialPaymentIndicator
                                                    invoice={invoice}
                                                    totalPaid={totalPaid}
                                                    currency={userCurrency}
                                                    size="compact"
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">No payments</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs sm:text-sm whitespace-nowrap">{invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : 'N/A'}</TableCell>
                                        <TableCell>
                                            <InvoiceStatusBadge status={invoice.status || 'draft'} size="small" />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <InvoiceActions 
                                                invoice={invoice}
                                                client={clients.find(c => c.id === invoice.client_id)}
                                                onActionSuccess={onActionSuccess}
                                                onPaymentFullyPaid={onPaymentFullyPaid}
                                                onOptimisticUpdate={onOptimisticUpdate}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}