import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
    office: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-300' },
    supplies: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-300' },
    utilities: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    software: { bg: 'bg-primary/15', text: 'text-primary' },
    other: { bg: 'bg-muted', text: 'text-muted-foreground' }
};

export default function RecentExpenses({ expenses = [], currency = 'ZAR' }) {
    const recentExpenses = expenses.slice(0, 5);

    return (
        <Card className="bg-card border border-border shadow-sm rounded-xl">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-base font-bold text-foreground">Recent Expenses</CardTitle>
                    <Link to={createPageUrl("CashFlow")}>
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                            View All
                        </Button>
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {recentExpenses.length === 0 ? (
                    <EmptyState
                        icon={<Receipt className="w-6 h-6 text-muted-foreground" />}
                        title="No expenses yet"
                        description="Track your business expenses to see them here."
                        action={
                            <Link to={createPageUrl("CashFlow")}>
                                <Button size="sm">Add First Expense</Button>
                            </Link>
                        }
                        className="py-8"
                    />
                ) : (
                    <div className="stagger-in space-y-1">
                    {recentExpenses.map((expense) => {
                        const Icon = categoryIcons[expense.category] || Receipt;
                        const color = categoryColors[expense.category] || categoryColors.other;

                        return (
                            <div key={expense.id} className="group flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors duration-150">
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 ${color.bg} rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110`}>
                                        <Icon className={`w-4 h-4 ${color.text}`} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{expense.description}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {expense.date ? format(new Date(expense.date), 'dd MMM yyyy') : 'No date'}
                                        </p>
                                    </div>
                                </div>
                                <p className="font-semibold text-sm text-destructive shrink-0 ml-2">
                                    -{formatCurrency(expense.amount, currency)}
                                </p>
                            </div>
                        );
                    })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}