import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { formatCurrency } from '@/utils/currencyCalculations';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subWeeks, subMonths, subYears, format, parseISO, isValid, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, endOfDay, endOfWeek, endOfMonth, endOfYear } from 'date-fns';

const CustomTooltip = ({ active, payload, currency }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                <p className="text-sm font-semibold text-slate-900">
                    {formatCurrency(payload[0].value, currency)}
                </p>
                <p className="text-xs text-slate-500">{payload[0].payload.name}</p>
            </div>
        );
    }
    return null;
};

export default function RevenueChart({ invoices = [], currency = 'ZAR' }) {
    const [period, setPeriod] = useState('Month');

    const periods = ['Day', 'Week', 'Month', 'Year'];

    const periodLabels = {
        'Day': 'Today',
        'Week': 'This Week',
        'Month': 'This Month',
        'Year': 'This Year'
    };

    const chartData = useMemo(() => {
        const now = new Date();
        const paidInvoices = invoices.filter(inv => inv.status === 'paid' || inv.status === 'partial_paid');

        if (period === 'Day') {
            // Show last 24 hours by hour groupings (simplified to last 7 days for better visualization)
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const day = subDays(now, i);
                const dayStart = startOfDay(day);
                const dayEnd = endOfDay(day);
                
                const dayRevenue = paidInvoices
                    .filter(inv => {
                        const invDate = parseISO(inv.created_date);
                        return isValid(invDate) && invDate >= dayStart && invDate <= dayEnd;
                    })
                    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

                days.push({
                    name: format(day, 'EEE'),
                    value: dayRevenue
                });
            }
            return days;
        }

        if (period === 'Week') {
            // Show last 4 weeks
            const weeks = [];
            for (let i = 3; i >= 0; i--) {
                const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
                const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
                
                const weekRevenue = paidInvoices
                    .filter(inv => {
                        const invDate = parseISO(inv.created_date);
                        return isValid(invDate) && invDate >= weekStart && invDate <= weekEnd;
                    })
                    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

                weeks.push({
                    name: `W${4 - i}`,
                    value: weekRevenue
                });
            }
            return weeks;
        }

        if (period === 'Month') {
            // Show last 6 months
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const monthStart = startOfMonth(subMonths(now, i));
                const monthEnd = endOfMonth(subMonths(now, i));
                
                const monthRevenue = paidInvoices
                    .filter(inv => {
                        const invDate = parseISO(inv.created_date);
                        return isValid(invDate) && invDate >= monthStart && invDate <= monthEnd;
                    })
                    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

                months.push({
                    name: format(monthStart, 'MMM'),
                    value: monthRevenue
                });
            }
            return months;
        }

        if (period === 'Year') {
            // Show last 4 years
            const years = [];
            for (let i = 3; i >= 0; i--) {
                const yearStart = startOfYear(subYears(now, i));
                const yearEnd = endOfYear(subYears(now, i));
                
                const yearRevenue = paidInvoices
                    .filter(inv => {
                        const invDate = parseISO(inv.created_date);
                        return isValid(invDate) && invDate >= yearStart && invDate <= yearEnd;
                    })
                    .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

                years.push({
                    name: format(yearStart, 'yyyy'),
                    value: yearRevenue
                });
            }
            return years;
        }

        return [];
    }, [invoices, period]);

    // Calculate total for current period
    const total = chartData?.reduce((sum, item) => sum + item.value, 0) || 0;

    return (
        <Card className="bg-white border-0 shadow-xl rounded-3xl">
            <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-slate-900 mb-2 text-base font-bold">Revenue {periodLabels[period]}</CardTitle>
                        <p className="text-3xl font-bold text-slate-900">{formatCurrency(total, currency)}</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2 mb-6 bg-slate-100 rounded-xl p-1">
                    {periods.map((p) => (
                        <Button
                            key={p}
                            variant={period === p ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setPeriod(p)}
                            className={`text-xs flex-1 rounded-lg ${
                                period === p 
                                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-sm' 
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-transparent'
                            }`}
                        >
                            {p}
                        </Button>
                    ))}
                </div>

                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="name" 
                            stroke="#94a3b8"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis 
                            stroke="#94a3b8"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : value}
                        />
                        <Tooltip content={<CustomTooltip currency={currency} />} />
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#8b5cf6" 
                            strokeWidth={3}
                            fill="url(#colorRevenue)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}