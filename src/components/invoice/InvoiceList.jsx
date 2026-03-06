import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PartialPaymentIndicator from "../payments/PartialPaymentIndicator";

const statusStyles = {
    draft: "bg-muted text-muted-foreground border-border",
    sent: "bg-primary/15 text-primary border-primary/20",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    partial_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    overdue: "bg-red-100 text-red-700 border-red-200"
};

export default function InvoiceList({ invoices, clients, isLoading, userCurrency, paymentsMap, onActionSuccess }) {
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
            <div className="overflow-x-auto mobile-scroll-x">
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
                            Array(5).fill(0).map((_, i) => (
                                <TableRow key={i} className="border-border">
                                    <TableCell><Skeleton className="h-4 w-16 sm:w-20 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24 sm:w-32 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32 sm:w-48 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20 sm:w-24 rounded" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-16 sm:w-20 rounded-full" /></TableCell>
                                    <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-lg" /></div></TableCell>
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