import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../CurrencySelector';
import { Users } from 'lucide-react';

export default function CustomerSpendingChart({ data, currency = 'ZAR' }) {
    if (!data || data.length === 0) {
        return (
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <CardTitle className="text-slate-900 font-bold">Top Customers by Spending</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="flex items-center justify-center h-64 text-gray-500">
                        <div className="text-center">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No customer data available</p>
                            <p className="text-sm">Paid invoices will appear here</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
            <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="text-slate-900 font-bold">Top Customers by Spending</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                            type="number"
                            tickFormatter={(value) => formatCurrency(value, currency, 0)}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <YAxis 
                            type="category"
                            dataKey="name" 
                            width={120}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip 
                            formatter={(value) => [formatCurrency(value, currency), 'Total Spending']}
                            contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }}
                        />
                        <Bar dataKey="revenue" fill="#6366f1" radius={[0, 8, 8, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}