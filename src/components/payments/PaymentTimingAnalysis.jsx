import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/utils/currencyCalculations";
import { format, parseISO, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";
import { TrendingUp } from "lucide-react";
import PropTypes from 'prop-types';

export default function PaymentTimingAnalysis({ payments = [], invoices = [], currency = 'USD' }) {
    // Calculate payment aging and timing metrics
    const calculatePaymentMetrics = () => {
        const metrics = {
            totalPayments: payments.length,
            totalAmountPaid: 0,
            averagePaymentAmount: 0,
            daysToPayAverage: 0,
            onTimeCount: 0,
            lateCount: 0,
            monthlyData: [],
            paymentAging: {
                current: 0,
                days30: 0,
                days60: 0,
                days90: 0,
                over90: 0
            }
        };

        if (payments.length === 0) return metrics;

        const now = new Date();
        const daysToPayArray = [];

        payments.forEach(payment => {
            metrics.totalAmountPaid += payment.amount || 0;

            if (payment.payment_date) {
                const paymentDate = parseISO(payment.payment_date);
                const invoice = invoices.find(inv => inv.id === payment.invoice_id);
                
                if (invoice && invoice.delivery_date) {
                    const dueDate = parseISO(invoice.delivery_date);
                    const daysDiff = Math.floor((paymentDate - dueDate) / (1000 * 60 * 60 * 24));
                    
                    if (daysDiff <= 0) {
                        metrics.onTimeCount++;
                    } else {
                        metrics.lateCount++;
                    }
                    daysToPayArray.push(daysDiff);
                }

                // Age payment (how long ago it was paid)
                const daysAgo = Math.floor((now - paymentDate) / (1000 * 60 * 60 * 24));
                if (daysAgo <= 30) metrics.paymentAging.current += payment.amount;
                else if (daysAgo <= 60) metrics.paymentAging.days30 += payment.amount;
                else if (daysAgo <= 90) metrics.paymentAging.days60 += payment.amount;
                else if (daysAgo > 90) metrics.paymentAging.days90 += payment.amount;
                else metrics.paymentAging.over90 += payment.amount;
            }
        });

        metrics.averagePaymentAmount = payments.length > 0 ? metrics.totalAmountPaid / payments.length : 0;
        metrics.daysToPayAverage = daysToPayArray.length > 0 
            ? (daysToPayArray.reduce((a, b) => a + b) / daysToPayArray.length)
            : 0;

        // Build monthly data
        const last12Months = eachMonthOfInterval({
            start: subMonths(now, 11),
            end: now
        });

        metrics.monthlyData = last12Months.map(month => {
            const monthStart = startOfMonth(month);
            const monthEnd = endOfMonth(month);

            const monthPayments = payments.filter(p => {
                const pDate = parseISO(p.payment_date);
                return pDate >= monthStart && pDate <= monthEnd;
            });

            return {
                month: format(month, 'MMM'),
                monthFull: format(month, 'MMMM yyyy'),
                payments: monthPayments.length,
                amount: monthPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
            };
        });

        return metrics;
    };

    const metrics = calculatePaymentMetrics();

    const onTimePercentage = metrics.totalPayments > 0 
        ? ((metrics.onTimeCount / metrics.totalPayments) * 100).toFixed(1)
        : 0;

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-gray-900">{metrics.totalPayments}</p>
                        <p className="text-xs text-gray-500">payments recorded</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.totalAmountPaid, currency)}</p>
                        <p className="text-xs text-gray-500">avg: {formatCurrency(metrics.averagePaymentAmount, currency)}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">On-Time Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-primary">{onTimePercentage}%</p>
                        <p className="text-xs text-gray-500">{metrics.onTimeCount} of {metrics.totalPayments}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Avg Days to Pay</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-orange-600">{metrics.daysToPayAverage.toFixed(0)}</p>
                        <p className="text-xs text-gray-500">
                            {metrics.daysToPayAverage > 0 ? 'late' : 'early'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Monthly Payment Trend */}
            {metrics.monthlyData.some(m => m.payments > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            Monthly Payment Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={metrics.monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip 
                                    formatter={(value, name) => {
                                        if (name === 'amount') return formatCurrency(value, currency);
                                        return value;
                                    }}
                                    labelFormatter={(label) => {
                                        const match = metrics.monthlyData.find(m => m.month === label);
                                        return match?.monthFull || label;
                                    }}
                                />
                                <Legend />
                                <Bar yAxisId="left" dataKey="amount" name="Amount Paid" fill="#10b981" />
                                <Bar yAxisId="right" dataKey="payments" name="Payment Count" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Payment Aging Distribution */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Last 30 Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(metrics.paymentAging.current, currency)}</p>
                        <Badge className="mt-2 bg-green-100 text-green-700 border-green-300">Current</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">31-60 Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-bold text-primary">{formatCurrency(metrics.paymentAging.days30, currency)}</p>
                        <Badge className="mt-2 bg-primary/15 text-primary border-primary/30">Aging</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">61-90 Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-bold text-orange-600">{formatCurrency(metrics.paymentAging['60days'], currency)}</p>
                        <Badge className="mt-2 bg-orange-100 text-orange-700 border-orange-300">Older</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">90+ Days</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-bold text-red-600">{formatCurrency(metrics.paymentAging['90days'] + metrics.paymentAging.over90days, currency)}</p>
                        <Badge className="mt-2 bg-red-100 text-red-700 border-red-300">Oldest</Badge>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-600">Payment Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-bold text-purple-600">
                            {metrics.totalPayments > 0 ? (metrics.totalAmountPaid / metrics.totalPayments).toFixed(0) : 0}
                        </p>
                        <Badge className="mt-2 bg-purple-100 text-purple-700 border-purple-300">per payment</Badge>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

PaymentTimingAnalysis.propTypes = {
    payments: PropTypes.array,
    invoices: PropTypes.array,
    currency: PropTypes.string
};
