import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../CurrencySelector';
import { TrendingUp } from 'lucide-react';

export default function CustomerSpendingTimeline({ data, currency = 'ZAR' }) {
    if (!data || data.length === 0) {
        return (
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-slate-900 font-bold">Customer Spending Over Time</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <div className="text-center">
                            <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No spending data available</p>
                            <p className="text-sm">Customer spending trends will appear here</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Get unique customers for different colored lines
    const customers = [...new Set(data.flatMap(d => Object.keys(d).filter(k => k !== 'month')))];
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

    return (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-slate-900 font-bold">Customer Spending Over Time</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                            dataKey="month" 
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis 
                            tickFormatter={(value) => formatCurrency(value, currency, 0)}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip 
                            formatter={(value) => formatCurrency(value, currency)}
                            contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }}
                        />
                        <Legend />
                        {customers.slice(0, 8).map((customer, index) => (
                            <Line 
                                key={customer}
                                type="monotone" 
                                dataKey={customer} 
                                stroke={colors[index % colors.length]}
                                strokeWidth={2}
                                dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 3 }}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}