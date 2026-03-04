import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/currencyCalculations';
import { format } from 'date-fns';
import { Receipt, MapPin, Briefcase, ShoppingBag, Coffee, Laptop } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const categoryIcons = {
    travel: MapPin,
    office: Briefcase,
    supplies: ShoppingBag,
    utilities: Coffee,
    software: Laptop,
    other: Receipt
};

const categoryColors = {
    travel: { bg: 'bg-primary/15', text: 'text-primary' },
    office: { bg: 'bg-purple-100', text: 'text-purple-600' },
    supplies: { bg: 'bg-green-100', text: 'text-green-600' },
    utilities: { bg: 'bg-orange-100', text: 'text-orange-600' },
    software: { bg: 'bg-primary/15', text: 'text-primary' },
    other: { bg: 'bg-slate-100', text: 'text-slate-600' }
};

export default function RecentExpenses({ expenses = [], currency = 'ZAR' }) {
    const recentExpenses = expenses.slice(0, 5);

    return (
        <Card className="bg-white border-0 shadow-xl rounded-3xl">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-bold text-slate-900">Recent Expenses</CardTitle>
                    <Link to={createPageUrl("CashFlow")}>
                        <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-900">
                            View All
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {recentExpenses.length === 0 ? (
                    <div className="text-center py-8">
                        <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">No expenses recorded yet</p>
                        <Link to={createPageUrl("CashFlow")}>
                            <Button className="mt-4" size="sm">
                                Add First Expense
                            </Button>
                        </Link>
                    </div>
                ) : (
                    recentExpenses.map((expense) => {
                        const Icon = categoryIcons[expense.category] || Receipt;
                        const color = categoryColors[expense.category] || categoryColors.other;

                        return (
                            <div key={expense.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 ${color.bg} rounded-xl flex items-center justify-center`}>
                                        <Icon className={`w-5 h-5 ${color.text}`} />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm text-slate-900">{expense.description}</p>
                                        <p className="text-xs text-slate-400">
                                            {expense.date ? format(new Date(expense.date), 'dd MMM yyyy') : 'No date'}
                                        </p>
                                    </div>
                                </div>
                                <p className="font-bold text-sm text-red-600">-{formatCurrency(expense.amount, currency)}</p>
                            </div>
                        );
                    })
                )}
            </CardContent>
        </Card>
    );
}