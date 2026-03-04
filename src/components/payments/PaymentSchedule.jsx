import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle, Clock, AlertCircle, Plus } from "lucide-react";
import { format, parseISO, isBefore, isToday } from "date-fns";
import { formatCurrency } from "@/utils/currencyCalculations";
import PropTypes from 'prop-types';

export default function PaymentSchedule({ 
    invoice, 
    payments = [], 
    schedule = [], 
    currency = 'USD',
    onAddSchedule,
    onRecordPayment 
}) {
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingBalance = invoice.total_amount - totalPaid;
    const paymentProgress = (totalPaid / invoice.total_amount) * 100;

    // Match payments to scheduled installments
    const installmentsWithStatus = schedule.map(installment => {
        const matchingPayments = payments.filter(p => 
            parseISO(p.payment_date).toDateString() === parseISO(installment.due_date).toDateString() ||
            Math.abs(p.amount - installment.amount) < 0.01
        );
        
        const paidAmount = matchingPayments.reduce((sum, p) => sum + p.amount, 0);
        const isOverdue = isBefore(parseISO(installment.due_date), new Date()) && paidAmount < installment.amount;
        const isDueToday = isToday(parseISO(installment.due_date));
        
        return {
            ...installment,
            paidAmount,
            isPaid: paidAmount >= installment.amount,
            isPartiallyPaid: paidAmount > 0 && paidAmount < installment.amount,
            isOverdue,
            isDueToday,
            matchingPayments
        };
    });

    const getStatusBadge = (installment) => {
        if (installment.isPaid) {
            return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
        }
        if (installment.isOverdue) {
            return <Badge className="bg-red-100 text-red-700 border-red-200"><AlertCircle className="w-3 h-3 mr-1" />Overdue</Badge>;
        }
        if (installment.isDueToday) {
            return <Badge className="bg-orange-100 text-orange-700 border-orange-200"><Clock className="w-3 h-3 mr-1" />Due Today</Badge>;
        }
        if (installment.isPartiallyPaid) {
            return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Partial</Badge>;
        }
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg">Payment Schedule</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">
                            Track installments and payment progress
                        </p>
                    </div>
                    {onAddSchedule && (
                        <Button variant="outline" size="sm" onClick={onAddSchedule}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Schedule
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Payment Progress */}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="font-medium text-gray-700">Payment Progress</span>
                        <span className="font-semibold text-gray-900">
                            {paymentProgress.toFixed(1)}%
                        </span>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 ${
                                paymentProgress === 100 ? 'bg-green-500' : 
                                paymentProgress >= 50 ? 'bg-primary/100' : 
                                'bg-yellow-500'
                            }`}
                            style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                        <span>Paid: {formatCurrency(totalPaid, currency)}</span>
                        <span>Remaining: {formatCurrency(remainingBalance, currency)}</span>
                    </div>
                </div>

                {/* Schedule List */}
                {schedule.length > 0 ? (
                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700">Installments</h4>
                        {installmentsWithStatus.map((installment, index) => (
                            <div 
                                key={index}
                                className={`p-4 rounded-lg border-2 transition-all ${
                                    installment.isPaid 
                                        ? 'bg-green-50 border-green-200' 
                                        : installment.isOverdue 
                                        ? 'bg-red-50 border-red-200'
                                        : installment.isDueToday
                                        ? 'bg-orange-50 border-orange-200'
                                        : 'bg-white border-gray-200'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-semibold text-gray-900">
                                                Installment #{index + 1}
                                            </span>
                                            {getStatusBadge(installment)}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>Due: {format(parseISO(installment.due_date), 'MMM d, yyyy')}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-gray-900">
                                            {formatCurrency(installment.amount, currency)}
                                        </p>
                                        {installment.isPartiallyPaid && (
                                            <p className="text-xs text-gray-600">
                                                Paid: {formatCurrency(installment.paidAmount, currency)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {installment.description && (
                                    <p className="text-sm text-gray-600 mb-2">{installment.description}</p>
                                )}

                                {!installment.isPaid && onRecordPayment && (
                                    <Button 
                                        size="sm" 
                                        className="mt-2 w-full"
                                        variant={installment.isOverdue ? "destructive" : "default"}
                                        onClick={() => onRecordPayment(installment)}
                                    >
                                        Record Payment
                                    </Button>
                                )}

                                {installment.matchingPayments.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p className="text-xs font-semibold text-gray-700 mb-2">Payments:</p>
                                        {installment.matchingPayments.map((payment, pIdx) => (
                                            <div key={pIdx} className="flex justify-between text-xs text-gray-600">
                                                <span>{format(parseISO(payment.payment_date), 'MMM d')}</span>
                                                <span className="font-medium">{formatCurrency(payment.amount, currency)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No payment schedule created</p>
                        {onAddSchedule && (
                            <Button variant="link" className="mt-2" onClick={onAddSchedule}>
                                Create payment schedule
                            </Button>
                        )}
                    </div>
                )}

                {/* Summary */}
                {schedule.length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-gray-600">Total Installments</p>
                                <p className="font-bold text-gray-900">{schedule.length}</p>
                            </div>
                            <div>
                                <p className="text-gray-600">Paid Installments</p>
                                <p className="font-bold text-green-600">
                                    {installmentsWithStatus.filter(i => i.isPaid).length}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-600">Overdue</p>
                                <p className="font-bold text-red-600">
                                    {installmentsWithStatus.filter(i => i.isOverdue).length}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-600">Pending</p>
                                <p className="font-bold text-gray-900">
                                    {installmentsWithStatus.filter(i => !i.isPaid && !i.isOverdue).length}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

PaymentSchedule.propTypes = {
    invoice: PropTypes.object.isRequired,
    payments: PropTypes.array,
    schedule: PropTypes.array,
    currency: PropTypes.string,
    onAddSchedule: PropTypes.func,
    onRecordPayment: PropTypes.func
};
