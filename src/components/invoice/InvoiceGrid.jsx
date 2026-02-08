import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { formatCurrency } from "../CurrencySelector";
import InvoiceActions from "./InvoiceActions";

const statusStyles = {
    draft: "bg-slate-100 text-slate-700 border-slate-200",
    sent: "bg-blue-100 text-blue-700 border-blue-200",
    viewed: "bg-purple-100 text-purple-700 border-purple-200",
    partial_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    overdue: "bg-rose-100 text-rose-700 border-rose-200"
};

export default function InvoiceGrid({ invoices, clients, isLoading, userCurrency, paymentsMap, onActionSuccess }) {
    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client ? client.name : "N/A";
    };

    const getTotalPaid = (invoiceId) => {
        const payments = paymentsMap?.get(invoiceId) || [];
        return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    };

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array(6).fill(0).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="p-6">
                            <Skeleton className="h-24 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {invoices.map(invoice => (
                <Card key={invoice.id} className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 space-y-1">
                                <p className="font-semibold text-slate-800 truncate" title={getClientName(invoice.client_id)}>
                                    {getClientName(invoice.client_id)}
                                </p>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-slate-600">{invoice.invoice_number}</p>
                                    <Badge variant="secondary" className={`${statusStyles[invoice.status || 'draft']} border text-[10px] px-1.5 py-0 h-5`}>
                                        {(invoice.status || 'draft').replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>
                            <InvoiceActions 
                                invoice={invoice}
                                client={clients.find(c => c.id === invoice.client_id)}
                                onActionSuccess={onActionSuccess}
                            />
                        </div>
                        
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[40px]">
                            {invoice.project_title || "No project title"}
                        </p>

                        <div className="flex justify-between items-end pt-4 border-t border-slate-100">
                            <div>
                                <p className="text-sm font-bold text-slate-800 text-lg">
                                    {formatCurrency(invoice.total_amount, userCurrency)}
                                </p>
                                {paymentsMap && (() => {
                                    const totalPaid = getTotalPaid(invoice.id);
                                    const remaining = invoice.total_amount - totalPaid;
                                    return totalPaid > 0 ? (
                                        <div className="mt-1 space-y-0.5">
                                            <p className="text-xs text-green-600 font-medium">
                                                Paid: {formatCurrency(totalPaid, userCurrency)}
                                            </p>
                                            {remaining > 0 && (
                                                <p className="text-xs text-slate-500">
                                                    Due: {formatCurrency(remaining, userCurrency)}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 mt-1">
                                            Created: {invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : 'N/A'}
                                        </p>
                                    );
                                })()}
                                {!paymentsMap && (
                                    <p className="text-xs text-slate-400 mt-1">
                                        Created: {invoice.created_date ? format(new Date(invoice.created_date), "MMM d, yyyy") : 'N/A'}
                                    </p>
                                )}
                            </div>
                            {invoice.delivery_date && (
                                <div className="text-right">
                                    <p className="text-xs text-slate-400">Due Date</p>
                                    <p className="text-xs font-medium text-slate-600">
                                        {format(new Date(invoice.delivery_date), "MMM d, yyyy")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}