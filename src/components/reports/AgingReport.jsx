import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '../CurrencySelector';
import { differenceInDays, parseISO, isValid } from 'date-fns';
import { AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const getAgingCategory = (invoice) => {
    if (invoice.status === 'paid' || invoice.status === 'draft') return null;
    
    const dueDate = invoice.delivery_date ? parseISO(invoice.delivery_date) : null;
    if (!dueDate || !isValid(dueDate)) return null;
    
    const daysOverdue = differenceInDays(new Date(), dueDate);
    
    if (daysOverdue < 0) return 'current';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
};

export default function AgingReport({ invoices, clients, currency = 'ZAR' }) {
    const agingData = {
        'current': { amount: 0, count: 0 },
        '1-30': { amount: 0, count: 0 },
        '31-60': { amount: 0, count: 0 },
        '61-90': { amount: 0, count: 0 },
        '90+': { amount: 0, count: 0 }
    };

    const customerAging = {};

    invoices.forEach(invoice => {
        const category = getAgingCategory(invoice);
        if (category) {
            agingData[category].amount += invoice.total_amount || 0;
            agingData[category].count += 1;

            // Track by customer
            const client = clients.find(c => c.id === invoice.client_id);
            const clientName = client?.name || 'Unknown';
            
            if (!customerAging[clientName]) {
                customerAging[clientName] = {
                    name: clientName,
                    current: 0,
                    overdue: 0,
                    total: 0
                };
            }

            if (category === 'current') {
                customerAging[clientName].current += invoice.total_amount || 0;
            } else {
                customerAging[clientName].overdue += invoice.total_amount || 0;
            }
            customerAging[clientName].total += invoice.total_amount || 0;
        }
    });

    const topDebtors = Object.values(customerAging)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const totalOutstanding = Object.values(agingData).reduce((sum, item) => sum + item.amount, 0);

    if (totalOutstanding === 0) {
        return (
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-slate-900 font-bold">Outstanding Balance Aging</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <div className="text-center">
                            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No outstanding invoices</p>
                            <p className="text-sm">All invoices are either paid or in draft</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-slate-900 font-bold">Outstanding Balance Aging</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="space-y-4">
                        {Object.entries(agingData).map(([category, data]) => {
                            if (data.count === 0) return null;
                            
                            const percentage = (data.amount / totalOutstanding) * 100;
                            const isOverdue = category !== 'current';
                            
                            return (
                                <div key={category} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-slate-700 capitalize">
                                                {category === 'current' ? 'Current (Not Due)' : `${category} Days Overdue`}
                                            </span>
                                            {isOverdue && (
                                                <Badge variant="destructive" className="text-xs">
                                                    <AlertCircle className="w-3 h-3 mr-1" />
                                                    {data.count} invoice{data.count > 1 ? 's' : ''}
                                                </Badge>
                                            )}
                                            {!isOverdue && (
                                                <Badge variant="secondary" className="text-xs">
                                                    {data.count} invoice{data.count > 1 ? 's' : ''}
                                                </Badge>
                                            )}
                                        </div>
                                        <span className={`font-bold ${isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(data.amount, currency)}
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                        <div 
                                            className={`h-full ${isOverdue ? 'bg-red-500' : 'bg-green-500'} transition-all`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {percentage.toFixed(1)}% of total outstanding
                                    </div>
                                </div>
                            );
                        })}
                        
                        <div className="pt-4 mt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-900">Total Outstanding</span>
                                <span className="font-bold text-2xl text-slate-900">
                                    {formatCurrency(totalOutstanding, currency)}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-slate-900 font-bold">Top Outstanding Customers</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 text-sm font-semibold text-slate-700">Customer</th>
                                    <th className="text-right py-3 text-sm font-semibold text-slate-700">Current</th>
                                    <th className="text-right py-3 text-sm font-semibold text-slate-700">Overdue</th>
                                    <th className="text-right py-3 text-sm font-semibold text-slate-700">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topDebtors.map((customer, index) => (
                                    <tr key={index} className="border-b border-slate-100">
                                        <td className="py-3 text-slate-900">{customer.name}</td>
                                        <td className="py-3 text-right text-green-600 font-medium">
                                            {formatCurrency(customer.current, currency)}
                                        </td>
                                        <td className="py-3 text-right text-red-600 font-medium">
                                            {formatCurrency(customer.overdue, currency)}
                                        </td>
                                        <td className="py-3 text-right font-bold text-slate-900">
                                            {formatCurrency(customer.total, currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}