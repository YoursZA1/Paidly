import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '../CurrencySelector';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function ProfitLossReport({ data, currency = 'ZAR', dateRange }) {
    const {
        revenue = 0,
        costOfSales = 0,
        operatingExpenses = 0,
        payrollExpenses = 0,
        otherExpenses = 0,
    } = data;

    const grossProfit = revenue - costOfSales;
    const totalOperatingExpenses = operatingExpenses + payrollExpenses + otherExpenses;
    const netProfit = grossProfit - totalOperatingExpenses;
    const grossProfitMargin = revenue > 0 ? (grossProfit / revenue * 100).toFixed(1) : 0;
    const netProfitMargin = revenue > 0 ? (netProfit / revenue * 100).toFixed(1) : 0;

    const RowItem = ({ label, value, isSubtotal, isTotal, isNegative }) => (
        <div className={`flex justify-between py-3 border-b ${
            isTotal ? 'border-slate-300 bg-slate-50 px-4 -mx-4 font-bold text-lg' :
            isSubtotal ? 'font-semibold bg-slate-50 px-4 -mx-4' : ''
        }`}>
            <span className={isNegative ? 'text-slate-600' : 'text-slate-800'}>{label}</span>
            <span className={
                isTotal ? (netProfit >= 0 ? 'text-green-600' : 'text-red-600') :
                isNegative ? 'text-red-600' : 'text-slate-900'
            }>
                {isNegative && value !== 0 ? '(' : ''}{formatCurrency(Math.abs(value), currency)}{isNegative && value !== 0 ? ')' : ''}
            </span>
        </div>
    );

    return (
        <Card className="bg-white border-0 shadow-xl">
            <CardHeader className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="text-slate-900 text-2xl">Profit & Loss Statement</CardTitle>
                        {dateRange && (
                            <p className="text-sm text-slate-600 mt-1">{dateRange}</p>
                        )}
                    </div>
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                        netProfit >= 0 ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                        {netProfit >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                            <TrendingDown className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`font-semibold ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {netProfitMargin}% Net Margin
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-8">
                <div className="space-y-1">
                    {/* Revenue */}
                    <div className="mb-4">
                        <h3 className="font-bold text-slate-700 mb-3 text-lg">Revenue</h3>
                        <RowItem label="Total Revenue" value={revenue} />
                    </div>

                    {/* Cost of Sales */}
                    <div className="mb-4">
                        <h3 className="font-bold text-slate-700 mb-3 text-lg">Cost of Sales</h3>
                        <RowItem label="Direct Costs" value={costOfSales} isNegative />
                    </div>

                    <RowItem label="Gross Profit" value={grossProfit} isSubtotal />
                    <div className="text-sm text-slate-500 pb-4 pl-4">
                        Gross Profit Margin: {grossProfitMargin}%
                    </div>

                    {/* Operating Expenses */}
                    <div className="mb-4">
                        <h3 className="font-bold text-slate-700 mb-3 text-lg">Operating Expenses</h3>
                        <RowItem label="Operating Expenses" value={operatingExpenses} isNegative />
                        <RowItem label="Payroll Expenses" value={payrollExpenses} isNegative />
                        <RowItem label="Other Expenses" value={otherExpenses} isNegative />
                        <RowItem label="Total Operating Expenses" value={totalOperatingExpenses} isSubtotal isNegative />
                    </div>

                    {/* Net Profit */}
                    <RowItem label="Net Profit" value={netProfit} isTotal />
                    <div className="text-sm text-slate-500 pt-2 pl-4">
                        Net Profit Margin: {netProfitMargin}%
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t">
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                        <p className="text-sm text-green-600 font-medium mb-1">Gross Profit</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(grossProfit, currency)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium mb-1">Total Expenses</p>
                        <p className="text-xl font-bold text-blue-700">{formatCurrency(totalOperatingExpenses, currency)}</p>
                    </div>
                    <div className={`${netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'} rounded-xl p-4 text-center`}>
                        <p className={`text-sm font-medium mb-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            Net Profit
                        </p>
                        <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {formatCurrency(netProfit, currency)}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}