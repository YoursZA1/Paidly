import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Clock } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyCalculations';
import { format, parseISO, isValid } from 'date-fns';

const PaymentCard = ({ label, amount, dueDate, iconBg }) => (
    <div className="bg-white rounded-3xl p-5 border-0 shadow-lg hover:shadow-xl transition-all">
        <div className="flex items-center justify-between mb-4">
            <div className={`w-14 h-14 ${iconBg} rounded-2xl flex items-center justify-center`}>
                <FileText className="w-7 h-7 text-white" />
            </div>
        </div>
        <p className="text-sm text-slate-600 mb-1 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900">{amount}</p>
        {dueDate && <p className="text-xs text-slate-500 mt-1">Due: {dueDate}</p>}
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
        'bg-gradient-to-br from-purple-600 to-blue-600',
        'bg-gradient-to-br from-blue-600 to-cyan-500'
    ];

    return (
        <Card className="bg-slate-50 border-0 shadow-xl rounded-3xl">
            <CardHeader>
                <CardTitle className="text-slate-900 flex items-center gap-2 text-base font-bold">
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
                    <div className="text-center py-6 text-slate-500">
                        <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm">No pending payments</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}