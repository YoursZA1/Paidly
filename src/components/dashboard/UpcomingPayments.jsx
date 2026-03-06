import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Clock } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { format, parseISO, isValid } from 'date-fns';

const PaymentCard = ({ label, amount, dueDate, iconBg }) => (
    <div className="bg-card rounded-2xl p-4 border border-border shadow-elevation hover:shadow-elevation-md transition-all min-w-0">
        <div className="flex items-center justify-between mb-4">
            <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center`}>
                <FileText className="w-7 h-7 text-white" />
            </div>
        </div>
        <p className="text-sm text-muted-foreground mb-1 truncate">{label}</p>
        <p className="text-xl font-bold text-foreground currency-nums truncate">{amount}</p>
        {dueDate && <p className="text-xs text-muted-foreground mt-1">Due: {dueDate}</p>}
    </div>
);

export default function UpcomingPayments({ invoices = [], clients = [], currency = 'ZAR' }) {
    // Filter unpaid invoices (sent, partial_paid, overdue)
    const unpaidInvoices = invoices
        .filter(inv => ['sent', 'partial_paid', 'overdue'].includes(inv.status))
        .sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date))
        .slice(0, 2);

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.name || 'Unknown Client';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const date = parseISO(dateStr);
        return isValid(date) ? format(date, 'MMM d') : null;
    };

    const iconBgs = [
        'bg-gradient-to-br from-primary to-[#ff7c00]',
        'bg-gradient-to-br from-[#f24e00] to-[#ff7c00]'
    ];

    return (
        <Card className="glass-card rounded-fintech border border-border mobile-card-wrap">
            <CardHeader className="pb-2">
                <CardTitle className="text-foreground flex items-center gap-2 text-base font-semibold">
                    <Clock className="w-5 h-5" />
                    Pending Payments
                </CardTitle>
            </CardHeader>
            <CardContent>
                {unpaidInvoices.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                        {unpaidInvoices.map((invoice, index) => (
                            <PaymentCard
                                key={invoice.id}
                                label={getClientName(invoice.client_id)}
                                amount={formatCurrency(invoice.total_amount, currency)}
                                dueDate={formatDate(invoice.delivery_date)}
                                iconBg={iconBgs[index % iconBgs.length]}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="py-2">
                        {/* Empty state: premium ghost list preview */}
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                                <FileText className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground">No pending payments</p>
                                <p className="text-xs text-muted-foreground truncate">When invoices are sent, they’ll show up here with due dates.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[0, 1].map((i) => (
                                <div key={i} className="bg-card rounded-2xl p-4 border border-border shadow-elevation min-w-0">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                                            <Skeleton className="h-6 w-6 rounded-lg" />
                                        </div>
                                    </div>
                                    <Skeleton className="h-3 w-24 mb-2 rounded" />
                                    <Skeleton className="h-6 w-28 rounded" />
                                    <Skeleton className="h-3 w-16 mt-2 rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}