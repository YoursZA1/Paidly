import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Expense, Invoice, Payment, User } from '@/api/entities';
import { formatCurrency } from '@/components/CurrencySelector';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import Logo from "@/components/shared/Logo";
import {
    buildCashFlowSnapshot,
    expenseOccurredAt,
    inDayRange,
    isCashExpense,
    listAllCashFlowRecords,
    sumEventsInRange,
} from '@/utils/cashFlowTruth';
import { listAllPosSalesEvents } from '@/utils/cashFlowData';

export default function CashFlowPDF() {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const monthsToShow = parseInt(params.get('months') || '6');
    
    const [expenses, setExpenses] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [posSales, setPosSales] = useState([]);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [expensesData, invoicesData, paymentsData, posSalesData, userData] = await Promise.all([
                listAllCashFlowRecords(Expense, "-date"),
                listAllCashFlowRecords(Invoice, "-created_date"),
                listAllCashFlowRecords(Payment, "-paid_at"),
                listAllPosSalesEvents().catch(() => []),
                User.me()
            ]);
            setExpenses(expensesData);
            setInvoices(invoicesData);
            setPayments(paymentsData);
            setPosSales(posSalesData || []);
            setUser(userData);
        } catch (error) {
            console.error("Error loading cash flow data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const snap = buildCashFlowSnapshot({ payments, expenses, invoices, posSales, now: new Date() });

    const calculateMetrics = () => ({
        currentMonthIncome: snap.monthlyIncome,
        currentMonthExpenses: snap.monthlyExpenses,
        netCashFlow: snap.netCashFlow,
        totalIncome: snap.allTimeIncome,
        totalExpenses: snap.allTimeExpenses,
    });

    const getMonthlyData = () => {
        const now = new Date();
        const points = monthsToShow >= 12 ? 12 : Math.max(monthsToShow, 6);
        return Array.from({ length: points }, (_, idx) => {
            const month = subMonths(now, points - 1 - idx);
            const start = startOfMonth(month);
            const end = endOfMonth(month);
            const income = sumEventsInRange(snap.incomeEvents, start, end);
            const expensesAmt = sumEventsInRange(snap.expenseEvents, start, end);
            const expenseList = expenses.filter(
                (exp) => isCashExpense(exp) && inDayRange(expenseOccurredAt(exp), start, end)
            );
            return {
                month: format(month, "MMMM yyyy"),
                income,
                expenses: expensesAmt,
                net: income - expensesAmt,
                expenseList,
            };
        });
    };

    const getCategoryBreakdown = () => {
        const breakdown = {};
        expenses.filter(isCashExpense).forEach((exp) => {
            const category = exp.category || "other";
            breakdown[category] = (breakdown[category] || 0) + (Number(exp.amount) || 0);
        });
        return Object.entries(breakdown)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!user) {
        return <div className="flex items-center justify-center min-h-screen">Data not found.</div>;
    }

    const metrics = calculateMetrics();
    const monthlyData = getMonthlyData();
    const categoryBreakdown = getCategoryBreakdown();

    return (
        <div className="min-h-screen bg-white p-8">
            <style>{`
                @media print {
                    body { margin: 0; padding: 20px; }
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; }
                }
            `}</style>

            {/* Header */}
            <div className="mb-8 border-b pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        {user.logo_url && <Logo path={user.logo_url} alt="Logo" className="h-16 mb-4" />}
                        <h1 className="text-3xl font-bold text-gray-900">Cash Flow Report</h1>
                        <p className="text-gray-600 mt-1">{user.company_name || user.full_name}</p>
                        {user.company_address && <p className="text-gray-600 text-sm">{user.company_address}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-600">Report Date</p>
                        <p className="text-lg font-semibold">{format(new Date(), 'MMMM d, yyyy')}</p>
                        <p className="text-sm text-gray-600 mt-2">Period: {monthsToShow} Months</p>
                    </div>
                </div>
            </div>

            {/* Summary Metrics */}
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Financial Summary</h2>
                <div className="grid grid-cols-4 gap-4">
                    <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Current Month Income</p>
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(metrics.currentMonthIncome, 'ZAR')}</p>
                    </div>
                    <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Current Month Expenses</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.currentMonthExpenses, 'ZAR')}</p>
                    </div>
                    <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Net Cash Flow</p>
                        <p className={`text-2xl font-bold ${metrics.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(metrics.netCashFlow, 'ZAR')}
                        </p>
                    </div>
                    <div className="border rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Total Profit</p>
                        <p className="text-2xl font-bold text-[#f24e00]">
                            {formatCurrency(metrics.totalIncome - metrics.totalExpenses, 'ZAR')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Monthly Breakdown */}
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Monthly Breakdown</h2>
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border p-3 text-left">Month</th>
                            <th className="border p-3 text-right">Income</th>
                            <th className="border p-3 text-right">Expenses</th>
                            <th className="border p-3 text-right">Net</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyData.map((month, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="border p-3">{month.month}</td>
                                <td className="border p-3 text-right text-green-600 font-medium">
                                    {formatCurrency(month.income, 'ZAR')}
                                </td>
                                <td className="border p-3 text-right text-red-600 font-medium">
                                    {formatCurrency(month.expenses, 'ZAR')}
                                </td>
                                <td className={`border p-3 text-right font-bold ${month.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(month.net, 'ZAR')}
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                            <td className="border p-3">TOTAL</td>
                            <td className="border p-3 text-right text-green-600">
                                {formatCurrency(monthlyData.reduce((sum, m) => sum + m.income, 0), 'ZAR')}
                            </td>
                            <td className="border p-3 text-right text-red-600">
                                {formatCurrency(monthlyData.reduce((sum, m) => sum + m.expenses, 0), 'ZAR')}
                            </td>
                            <td className="border p-3 text-right">
                                {formatCurrency(monthlyData.reduce((sum, m) => sum + m.net, 0), 'ZAR')}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Expense by Category */}
            <div className="mb-8 page-break">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Expenses by Category</h2>
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="border p-3 text-left">Category</th>
                            <th className="border p-3 text-right">Amount</th>
                            <th className="border p-3 text-right">Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categoryBreakdown.map((cat, index) => {
                            const percentage = (cat.value / metrics.totalExpenses) * 100;
                            return (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="border p-3 capitalize">{cat.name}</td>
                                    <td className="border p-3 text-right font-medium">
                                        {formatCurrency(cat.value, 'ZAR')}
                                    </td>
                                    <td className="border p-3 text-right">
                                        {percentage.toFixed(1)}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Recent Expenses by Month */}
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Detailed Expense List</h2>
                {monthlyData.map((monthData, monthIndex) => {
                    if (monthData.expenseList.length === 0) return null;
                    return (
                        <div key={monthIndex} className="mb-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">{monthData.month}</h3>
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="border p-2 text-left">Date</th>
                                        <th className="border p-2 text-left">Category</th>
                                        <th className="border p-2 text-left">Description</th>
                                        <th className="border p-2 text-left">Vendor</th>
                                        <th className="border p-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthData.expenseList.map((expense, expIndex) => (
                                        <tr key={expIndex} className="hover:bg-gray-50">
                                            <td className="border p-2">{expense.date ? format(parseISO(String(expense.date).slice(0, 10)), 'MMM d, yyyy') : '—'}</td>
                                            <td className="border p-2 capitalize">{expense.category}</td>
                                            <td className="border p-2">{expense.description}</td>
                                            <td className="border p-2">{expense.vendor || '-'}</td>
                                            <td className="border p-2 text-right font-medium">
                                                {formatCurrency(expense.amount, 'ZAR')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t text-center text-sm text-gray-500">
                <p>Generated by Paidly - {format(new Date(), 'MMMM d, yyyy HH:mm')}</p>
            </div>
        </div>
    );
}