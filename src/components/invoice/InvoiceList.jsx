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
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    partial_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    overdue: "bg-rose-100 text-rose-700 border-rose-200"
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

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <Table className="min-w-[800px]">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Project Title</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Paid</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            Array(5).fill(0).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                                    <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
                                </TableRow>
                            ))
                        ) : (
                            invoices.map(invoice => {
                                const totalPaid = getTotalPaid(invoice.id);
                                const remaining = invoice.total_amount - totalPaid;
                                return (
                                    <TableRow key={invoice.id} className="hover:bg-slate-50">
                                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                                        <TableCell>{getClientName(invoice.client_id)}</TableCell>
                                        <TableCell>{invoice.project_title}</TableCell>
                                        <TableCell>{formatCurrency(invoice.total_amount, userCurrency)}</TableCell>
                                        <TableCell>
                                            {totalPaid > 0 ? (
                                                <PartialPaymentIndicator
                                                    invoice={invoice}
                                                    totalPaid={totalPaid}
                                                    currency={userCurrency}
                                                    size="compact"
                                                />
                                            ) : (
                                                <span className="text-xs text-gray-400">No payments</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : 'N/A'}</TableCell>
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