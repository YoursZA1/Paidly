import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Calendar, CreditCard, FileText, Building2, Banknote, Smartphone } from "lucide-react";
import { formatCurrency } from "@/utils/currencyCalculations";
import { format, parseISO } from "date-fns";
import PropTypes from 'prop-types';

const paymentMethodIcons = {
    bank_transfer: Building2,
    cash: Banknote,
    credit_card: CreditCard,
    debit_card: CreditCard,
    mobile_payment: Smartphone,
    check: Banknote,
    other: DollarSign
};

const paymentMethodLabels = {
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    mobile_payment: 'Mobile Payment',
    check: 'Check',
    other: 'Other'
};

export default function PaymentHistory({ payments = [], currency = 'USD' }) {
    if (!payments || payments.length === 0) {
        return (
            <Card className="bg-white border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        Payment History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-8">
                        <DollarSign className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-slate-600">No payments recorded yet</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

    return (
        <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        Payment History
                        <Badge variant="secondary">{payments.length}</Badge>
                    </CardTitle>
                    <div className="text-right">
                        <p className="text-xs text-slate-500">Total Paid</p>
                        <p className="text-lg font-bold text-green-600">
                            {formatCurrency(totalPaid, currency)}
                        </p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                    {payments.map((payment) => {
                        const methodKey = payment.payment_method || payment.method;
                        const Icon = paymentMethodIcons[methodKey] || DollarSign;
                        const methodLabel = paymentMethodLabels[methodKey] || methodKey || 'Other';
                        
                        return (
                            <div key={payment.id} className="p-4 hover:bg-slate-50 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Icon className="w-5 h-5 text-green-600" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-slate-900">
                                                    {formatCurrency(payment.amount, currency)}
                                                </p>
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                                    {methodLabel}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {(payment.payment_date || payment.paid_at) ? format(parseISO(payment.payment_date || payment.paid_at), 'MMM d, yyyy') : '—'}
                                                </span>
                                                {(payment.reference_number || payment.reference) && (
                                                    <span className="flex items-center gap-1">
                                                        <FileText className="w-3 h-3" />
                                                        Ref: {payment.reference_number || payment.reference}
                                                    </span>
                                                )}
                                            </div>
                                            {payment.notes && (
                                                <p className="text-sm text-slate-600 mt-2">
                                                    {payment.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right text-xs text-slate-400">
                                        {(payment.created_date || payment.created_at) && (
                                            <p>Recorded {format(parseISO(payment.created_date || payment.created_at), 'MMM d')}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

PaymentHistory.propTypes = {
    payments: PropTypes.array,
    currency: PropTypes.string
};
