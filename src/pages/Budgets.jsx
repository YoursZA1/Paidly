import React, { useState, useEffect } from 'react';
import { Budget, Expense, Invoice } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign, Plus, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/components/CurrencySelector';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval, subMonths, format, addMonths } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import BudgetForm from '@/components/budgets/BudgetForm';
import ForecastingChart from '@/components/budgets/ForecastingChart';

export default function BudgetsPage() {
    const [budgets, setBudgets] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [editingBudget, setEditingBudget] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [budgetsData, expensesData, invoicesData] = await Promise.all([
                Budget.list(),
                Expense.list(),
                Invoice.list()
            ]);
            setBudgets(budgetsData);
            setExpenses(expensesData);
            setInvoices(invoicesData);
        } catch (error) {
            console.error("Error loading budget data:", error);
        }
        setLoading(false);
    };

    const calculateSpending = (category, period, type) => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        if (type === 'expense') {
            return expenses
                .filter(exp => {
                    if (category !== 'total' && exp.category !== category) return false;
                    const date = parseISO(exp.date);
                    return isWithinInterval(date, { start, end });
                })
                .reduce((sum, exp) => sum + (exp.amount || 0), 0);
        } else {
            // Income
            return invoices
                .filter(inv => {
                    const date = parseISO(inv.created_date);
                    return isWithinInterval(date, { start, end }) && 
                           (inv.status === 'paid' || inv.status === 'partial_paid');
                })
                .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        }
    };

    const handleDeleteBudget = async (id) => {
        if (confirm("Delete this budget?")) {
            await Budget.delete(id);
            loadData();
        }
    };

    const BudgetCard = ({ budget }) => {
        const spent = calculateSpending(budget.category, budget.period, budget.type);
        const percentage = Math.min((spent / budget.amount) * 100, 100);
        const isOverBudget = spent > budget.amount;
        
        return (
            <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex flex-col">
                        <CardTitle className="text-sm font-medium text-slate-600">
                            {budget.name}
                        </CardTitle>
                        <CardDescription className="text-xs capitalize">
                            {budget.period} • {budget.category === 'total' ? 'All Categories' : budget.category}
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingBudget(budget); setShowBudgetForm(true); }}>
                        <ArrowUpRight className="h-4 w-4 text-slate-400" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                            <span className="text-2xl font-bold">{formatCurrency(spent)}</span>
                            <span className="text-sm text-slate-500 ml-1">of {formatCurrency(budget.amount)}</span>
                        </div>
                        {isOverBudget && <AlertCircle className="w-5 h-5 text-red-500" />}
                    </div>
                    <Progress 
                        value={percentage} 
                        className={`h-2 ${isOverBudget ? "bg-red-100" : "bg-slate-100"}`}
                        indicatorClassName={isOverBudget ? "bg-red-500" : budget.type === 'income' ? "bg-green-500" : "bg-blue-500"} 
                    />
                    <div className="mt-2 text-xs text-slate-500 flex justify-between">
                        <span>{percentage.toFixed(0)}% {budget.type === 'income' ? 'Achieved' : 'Used'}</span>
                        <span>{formatCurrency(Math.max(0, budget.amount - spent))} {budget.type === 'income' ? 'to go' : 'remaining'}</span>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Budgets & Forecasting</h1>
                        <p className="text-slate-600">Track spending and predict future cash flow</p>
                    </div>
                    <Button onClick={() => { setEditingBudget(null); setShowBudgetForm(true); }} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Set New Budget
                    </Button>
                </div>

                {/* Forecasting Section */}
                <ForecastingChart expenses={expenses} invoices={invoices} />

                {/* Budgets Section */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 text-slate-800">Active Budgets</h2>
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl animate-pulse" />)}
                        </div>
                    ) : budgets.length === 0 ? (
                        <Card className="bg-slate-50 border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-10 text-slate-500">
                                <DollarSign className="w-10 h-10 mb-2 opacity-20" />
                                <p>No budgets set yet.</p>
                                <Button variant="link" onClick={() => setShowBudgetForm(true)}>Create one now</Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {budgets.map(budget => (
                                <BudgetCard key={budget.id} budget={budget} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={showBudgetForm} onOpenChange={setShowBudgetForm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingBudget ? 'Edit Budget' : 'Set New Budget'}</DialogTitle>
                    </DialogHeader>
                    <BudgetForm 
                        budget={editingBudget} 
                        onSave={async (data) => {
                            if (editingBudget) {
                                await Budget.update(editingBudget.id, data);
                            } else {
                                await Budget.create(data);
                            }
                            setShowBudgetForm(false);
                            loadData();
                        }}
                        onCancel={() => setShowBudgetForm(false)}
                        onDelete={() => {
                            handleDeleteBudget(editingBudget.id);
                            setShowBudgetForm(false);
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}