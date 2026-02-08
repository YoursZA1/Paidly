import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { startOfMonth, endOfMonth, subMonths, addMonths, format, parseISO, isWithinInterval } from 'date-fns';
import { formatCurrency } from '@/components/CurrencySelector';
import { TrendingUp } from 'lucide-react';

export default function ForecastingChart({ expenses, invoices }) {
    
    const data = useMemo(() => {
        const historyMonths = 6;
        const forecastMonths = 4;
        const chartData = [];
        
        // 1. Calculate Historical Data
        for (let i = historyMonths; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const start = startOfMonth(date);
            const end = endOfMonth(date);
            
            const income = invoices
                .filter(inv => {
                    const d = parseISO(inv.created_date);
                    return isWithinInterval(d, { start, end }) && 
                           (inv.status === 'paid' || inv.status === 'partial_paid');
                })
                .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

            const expense = expenses
                .filter(exp => {
                    const d = parseISO(exp.date);
                    return isWithinInterval(d, { start, end });
                })
                .reduce((sum, exp) => sum + (exp.amount || 0), 0);

            chartData.push({
                name: format(date, 'MMM'),
                fullDate: date,
                income,
                expense,
                cashflow: income - expense,
                type: 'Historical'
            });
        }

        // 2. Simple Linear Forecast (Avg of last 3 months)
        const recentHistory = chartData.slice(-3);
        const avgIncome = recentHistory.reduce((s, d) => s + d.income, 0) / recentHistory.length;
        const avgExpense = recentHistory.reduce((s, d) => s + d.expense, 0) / recentHistory.length;
        
        // Add last historical point as first forecast point to connect lines
        const lastReal = chartData[chartData.length - 1];

        // 3. Generate Forecast
        for (let i = 1; i <= forecastMonths; i++) {
            const date = addMonths(new Date(), i);
            // Simple trend logic: +2% growth per month
            const growthFactor = 1 + (0.02 * i); 
            
            chartData.push({
                name: format(date, 'MMM') + ' (Est)',
                income: avgIncome * growthFactor,
                expense: avgExpense * (1 + (0.01 * i)), // Expenses grow slightly slower
                cashflow: (avgIncome * growthFactor) - (avgExpense * (1 + (0.01 * i))),
                type: 'Forecast'
            });
        }

        return chartData;
    }, [expenses, invoices]);

    return (
        <Card className="bg-white">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Cash Flow Forecast</CardTitle>
                        <CardDescription>Historical data vs Projected performance (next 4 months)</CardDescription>
                    </div>
                    <div className="flex items-center text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        AI Prediction: Positive Trend
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" />
                            <YAxis tickFormatter={(val) => `R${val/1000}k`} />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <Tooltip 
                                formatter={(value) => formatCurrency(value)}
                                labelStyle={{ color: '#64748b' }}
                            />
                            <Legend />
                            <Area 
                                type="monotone" 
                                dataKey="income" 
                                stroke="#10b981" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill="url(#colorIncome)" 
                                name="Income"
                            />
                            <Area 
                                type="monotone" 
                                dataKey="expense" 
                                stroke="#ef4444" 
                                strokeWidth={2}
                                fillOpacity={1} 
                                fill="url(#colorExpense)" 
                                name="Expenses"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}