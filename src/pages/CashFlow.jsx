import React, { useState, useEffect } from "react";
import { Expense, Invoice, User, Payment } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, TrendingDown, DollarSign, Camera, Download, Mail, Building2, Upload, ArrowUpRight, ArrowDownLeft, Wallet } from "lucide-react";
import { formatCurrency } from "../components/CurrencySelector";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import ExpenseForm from "../components/cashflow/ExpenseForm";
import ExpenseList from "../components/cashflow/ExpenseList";
import ReceiptScanner from "../components/cashflow/ReceiptScanner";
import BankImportModal from "../components/cashflow/BankImportModal";
import ExpenseFilters, { applyExpenseFilters } from "../components/filters/ExpenseFilters";
import CashFlowAccuracy from "../components/cashflow/CashFlowAccuracy";
import PaymentTimingAnalysis from "../components/payments/PaymentTimingAnalysis";
import OverduePaymentTracker from "../components/payments/OverduePaymentTracker";
import PaymentMethodAnalytics from "../components/payments/PaymentMethodAnalytics";
import OutstandingBalanceDashboard from "../components/payments/OutstandingBalanceDashboard";
import { breakApi } from "@/api/apiClient";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { createPageUrl } from "@/utils";
import { useNavigate } from 'react-router-dom';
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function CashFlowPage() {
    const navigate = useNavigate();
    const [expenses, setExpenses] = useState([]);
    const [payments, setPayments] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [showReceiptScanner, setShowReceiptScanner] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [monthsToShow, setMonthsToShow] = useState(6);
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [recipientEmail, setRecipientEmail] = useState('');
    const [expenseFilters, setExpenseFilters] = useState({});
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [expensesData, invoicesData, paymentsData, userData] = await Promise.all([
                Expense.list("-date"),
                Invoice.list("-created_date"),
                Payment.list("-payment_date"),
                User.me()
            ]);
            setExpenses(expensesData);
            setPayments(paymentsData || []);
            setInvoices(invoicesData);
            setUser(userData);
        } catch (error) {
            console.error("Error loading cash flow data:", error);
        }
        setIsLoading(false);
    };

    const calculateMetrics = () => {
        const now = new Date();
        const currentMonthStart = startOfMonth(now);
        const currentMonthEnd = endOfMonth(now);

        // Current month income from received payments (not invoice creation date)
        const currentMonthIncome = payments
            .filter(payment => {
                if (!payment.payment_date) return false;
                const paymentDate = parseISO(payment.payment_date);
                return paymentDate >= currentMonthStart && paymentDate <= currentMonthEnd;
            })
            .reduce((sum, payment) => sum + (payment.amount || 0), 0);

        // Current month expenses
        const currentMonthExpenses = expenses
            .filter(exp => {
                if (!exp.date) return false;
                const expDate = parseISO(exp.date);
                return expDate >= currentMonthStart && expDate <= currentMonthEnd;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Net cash flow
        const netCashFlow = currentMonthIncome - currentMonthExpenses;

        // Total income (all time) - sum of all received payments
        const totalIncome = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

        // Total expenses (all time)
        const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        return {
            currentMonthIncome,
            currentMonthExpenses,
            netCashFlow,
            totalIncome,
            totalExpenses
        };
    };

    const getChartData = () => {
        const months = [];
        for (let i = monthsToShow - 1; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const monthStart = startOfMonth(date);
            const monthEnd = endOfMonth(date);

            // Use payment_date instead of invoice created_date
            const income = payments
                .filter(payment => {
                    if (!payment.payment_date) return false;
                    const paymentDate = parseISO(payment.payment_date);
                    return paymentDate >= monthStart && paymentDate <= monthEnd;
                })
                .reduce((sum, payment) => sum + (payment.amount || 0), 0);

            const expensesAmount = expenses
                .filter(exp => {
                    if (!exp.date) return false;
                    const expDate = parseISO(exp.date);
                    return expDate >= monthStart && expDate <= monthEnd;
                })
                .reduce((sum, exp) => sum + (exp.amount || 0), 0);

            months.push({
                month: format(date, 'MMM yyyy'),
                income: income,
                expenses: expensesAmount,
                net: income - expensesAmount
            });
        }
        return months;
    };

    const getCategoryBreakdown = () => {
        const breakdown = {};
        expenses.forEach(exp => {
            const category = exp.category || 'other';
            breakdown[category] = (breakdown[category] || 0) + exp.amount;
        });
        return Object.entries(breakdown).map(([name, value]) => ({ name, value }));
    };

    const MetricCard = ({ title, value, icon: Icon, color, trend, trendValue }) => (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
                    <div className={`p-2 rounded-lg ${color}`}>
                        <Icon className="h-4 w-4 text-white" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(value, userCurrency)}</div>
                    {trend && (
                        <div className={`text-xs flex items-center gap-1 mt-2 ${trendValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trendValue >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                            {Math.abs(trendValue)}% from last month
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );

    const handleSaveExpense = async (expenseData) => {
        try {
            if (editingExpense && editingExpense.id) {
                await Expense.update(editingExpense.id, expenseData);
            } else {
                await Expense.create(expenseData);
            }
            loadData();
            setShowExpenseForm(false);
            setEditingExpense(null);
        } catch (error) {
            console.error("Error saving expense:", error);
        }
    };

    const handleEditExpense = (expense) => {
        setEditingExpense(expense);
        setShowExpenseForm(true);
    };

    const handleDeleteExpense = async (expenseId) => {
        try {
            await Expense.delete(expenseId);
            loadData();
        } catch (error) {
            console.error("Error deleting expense:", error);
        }
    };

    const handleScanComplete = (scannedData) => {
        setEditingExpense(scannedData);
        setShowReceiptScanner(false);
        setShowExpenseForm(true);
    };

    const metrics = calculateMetrics();
    const chartData = getChartData();
    const categoryData = getCategoryBreakdown();
    const userCurrency = user?.currency || 'ZAR';

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-gray-100"
        >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Cash Flow</h1>
                        <p className="text-gray-600 mt-1">Monitor your income and expenses</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button 
                            onClick={() => setShowReceiptScanner(true)}
                            variant="outline"
                            className="gap-2"
                        >
                            <Camera className="w-4 h-4" />
                            <span className="hidden sm:inline">Scan</span>
                        </Button>
                        <Button 
                            onClick={() => setShowImportModal(true)}
                            variant="outline"
                            className="gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            <span className="hidden sm:inline">Import</span>
                        </Button>
                        <Button 
                            onClick={() => setShowEmailDialog(true)}
                            variant="outline"
                            className="gap-2"
                        >
                            <Mail className="w-4 h-4" />
                            <span className="hidden sm:inline">Email</span>
                        </Button>
                        <Button 
                            onClick={() => {
                                setEditingExpense(null);
                                setShowExpenseForm(true);
                            }}
                            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Expense</span>
                        </Button>
                    </div>
                </motion.div>

                {/* Metrics Cards */}
                {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <Card key={i}>
                                <CardHeader className="pb-2">
                                    <Skeleton className="h-4 w-1/2" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-8 w-2/3 mb-2" />
                                    <Skeleton className="h-3 w-1/2" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard 
                            title="Income (This Month)" 
                            value={metrics.currentMonthIncome}
                            icon={TrendingUp}
                            color="bg-blue-500"
                        />
                        <MetricCard 
                            title="Expenses (This Month)" 
                            value={metrics.currentMonthExpenses}
                            icon={TrendingDown}
                            color="bg-red-500"
                        />
                        <MetricCard 
                            title="Net Cash Flow" 
                            value={metrics.netCashFlow}
                            icon={Wallet}
                            color={metrics.netCashFlow >= 0 ? "bg-green-500" : "bg-orange-500"}
                        />
                        <MetricCard 
                            title="Total Income" 
                            value={metrics.totalIncome}
                            icon={DollarSign}
                            color="bg-purple-500"
                        />
                    </div>
                )}

                {/* Charts Tabs */}
                <div className="flex gap-2 border-b border-gray-200">
                    {['overview', 'expenses', 'analysis'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 font-medium transition-colors capitalize ${
                                activeTab === tab 
                                    ? 'text-emerald-600 border-b-2 border-emerald-600' 
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Charts */}
                {activeTab === 'overview' && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>Income vs Expenses ({monthsToShow} months)</CardTitle>
                                <div className="flex gap-2 mt-2">
                                    {[3, 6, 12].map(months => (
                                        <Button
                                            key={months}
                                            onClick={() => setMonthsToShow(months)}
                                            variant={monthsToShow === months ? 'default' : 'outline'}
                                            size="sm"
                                        >
                                            {months}M
                                        </Button>
                                    ))}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={400}>
                                    <BarChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis />
                                        <Tooltip formatter={(value) => formatCurrency(value, userCurrency)} />
                                        <Legend />
                                        <Bar dataKey="income" fill="#3b82f6" name="Income" />
                                        <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Net Cash Flow Trend</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis />
                                        <Tooltip formatter={(value) => formatCurrency(value, userCurrency)} />
                                        <Legend />
                                        <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} name="Net Flow" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {activeTab === 'expenses' && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Expense Breakdown</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {categoryData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={categoryData}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={({ name, value }) => `${name}: ${formatCurrency(value, userCurrency)}`}
                                                    outerRadius={80}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                >
                                                    {categoryData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value) => formatCurrency(value, userCurrency)} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-48 flex items-center justify-center text-gray-500">
                                            No expense data available
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Category Summary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {categoryData.map((category, idx) => (
                                            <div key={idx} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div 
                                                        className="w-3 h-3 rounded-full" 
                                                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                                                    />
                                                    <span className="text-sm font-medium capitalize">{category.name}</span>
                                                </div>
                                                <span className="text-sm font-bold">{formatCurrency(category.value, userCurrency)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Filters & Expense List */}
                        <ExpenseFilters onFilterChange={setExpenseFilters} />
                        <ExpenseList 
                            expenses={applyExpenseFilters(expenses, expenseFilters)}
                            isLoading={isLoading}
                            onEdit={handleEditExpense}
                            onDelete={handleDeleteExpense}
                            currency={userCurrency}
                            onActionSuccess={loadData}
                        />
                    </motion.div>
                )}

                {activeTab === 'analysis' && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        {/* Cash Flow Accuracy & Summary */}
                        <CashFlowAccuracy 
                            payments={payments}
                            expenses={expenses}
                            currency={userCurrency}
                        />

                        {/* Outstanding Balance Dashboard */}
                        <OutstandingBalanceDashboard 
                            invoices={invoices}
                            payments={payments}
                            currency={userCurrency}
                        />

                        {/* Payment Method Analytics */}
                        <PaymentMethodAnalytics 
                            payments={payments}
                            currency={userCurrency}
                        />

                        {/* Payment Timing Analysis */}
                        <PaymentTimingAnalysis 
                            payments={payments}
                            invoices={invoices}
                            currency={userCurrency}
                        />

                        {/* Overdue Payment Tracker */}
                        <OverduePaymentTracker 
                            invoices={invoices}
                            payments={payments}
                        />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Monthly Summary</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {chartData.slice(-3).reverse().map((month, idx) => (
                                        <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-medium">{month.month}</span>
                                                <span className={`text-lg font-bold ${month.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(month.net, userCurrency)}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-600 space-y-1">
                                                <div>Income: {formatCurrency(month.income, userCurrency)}</div>
                                                <div>Expenses: {formatCurrency(month.expenses, userCurrency)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Statistics</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <p className="text-sm text-gray-600">Average Monthly Income</p>
                                    <p className="text-2xl font-bold text-blue-600">
                                        {formatCurrency(metrics.totalIncome / Math.max(chartData.length, 1), userCurrency)}
                                    </p>
                                </div>
                                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                                    <p className="text-sm text-gray-600">Average Monthly Expenses</p>
                                    <p className="text-2xl font-bold text-red-600">
                                        {formatCurrency(metrics.totalExpenses / Math.max(chartData.length, 1), userCurrency)}
                                    </p>
                                </div>
                                <div className={`p-4 rounded-lg border ${metrics.totalIncome > metrics.totalExpenses ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                                    <p className="text-sm text-gray-600">Overall Balance</p>
                                    <p className={`text-2xl font-bold ${metrics.totalIncome > metrics.totalExpenses ? 'text-green-600' : 'text-orange-600'}`}>
                                        {formatCurrency(metrics.totalIncome - metrics.totalExpenses, userCurrency)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                        </div>
                    </motion.div>
                )}

                {/* Modals */}
                {/* Receipt Scanner Modal */}
                {showReceiptScanner && (
                    <ReceiptScanner
                        onScanComplete={handleScanComplete}
                        onCancel={() => setShowReceiptScanner(false)}
                    />
                )}

                {/* Bank Import Modal */}
                {showImportModal && (
                    <BankImportModal
                        onImportComplete={() => {
                            setShowImportModal(false);
                            loadData();
                        }}
                        onCancel={() => setShowImportModal(false)}
                    />
                )}

                {/* Expense Form Modal */}
                {showExpenseForm && (
                    <ExpenseForm
                        expense={editingExpense}
                        onSave={handleSaveExpense}
                        onCancel={() => {
                            setShowExpenseForm(false);
                            setEditingExpense(null);
                        }}
                    />
                )}

                {/* Email Dialog */}
                <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Email Cash Flow Report</DialogTitle>
                            <DialogDescription>
                                Enter the email address to send the cash flow report
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Input
                                type="email"
                                placeholder="recipient@example.com"
                                value={recipientEmail}
                                onChange={(e) => setRecipientEmail(e.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={async () => {
                                    if (recipientEmail) {
                                        try {
                                            const reportUrl = `${window.location.origin}${createPageUrl(`CashFlowPDF?months=${monthsToShow}`)}`;
                                            await breakApi.integrations.Core.SendEmail({
                                                to: recipientEmail,
                                                subject: `Cash Flow Report - ${format(new Date(), 'MMMM yyyy')}`,
                                                body: `Please find your cash flow report for the last ${monthsToShow} months here: ${reportUrl}`
                                            });
                                            setShowEmailDialog(false);
                                            setRecipientEmail('');
                                            alert('Report sent successfully!');
                                        } catch (error) {
                                            console.error('Error sending email:', error);
                                            alert('Failed to send email. Please try again.');
                                        }
                                    }
                                }}
                                disabled={!recipientEmail}
                            >
                                Send
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </motion.div>
    );
}