import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Invoice, Expense, Payment } from '@/api/entities';
import { format } from 'date-fns';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  PieChart,
  FileText,
  Calculator,
  Receipt,
  Wallet
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart as PieChartComponent, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../CurrencySelector';
import TaxService from '@/services/TaxService';
import PropTypes from 'prop-types';

export default function AccountingDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);

  const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
  const userCurrency = user?.currency || 'USD';

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [invoiceData, expenseData, paymentData] = await Promise.all([
          Invoice.list('-created_date'),
          Expense.list('-date'),
          Payment.list('-payment_date').catch(() => []),
        ]);
        setInvoices(invoiceData || []);
        setExpenses(expenseData || []);
        setPayments(paymentData || []);
      } catch (error) {
        console.error('Failed to load accounting data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const financialData = useMemo(() => {
    const paidStatuses = new Set(['paid', 'partial_paid']);
    const outstandingStatuses = new Set(['sent', 'overdue']);
    const revenue = invoices
      .filter((inv) => paidStatuses.has(inv.status))
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const outstandingInvoices = invoices
      .filter((inv) => outstandingStatuses.has(inv.status))
      .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    
    // Calculate tax information
    const taxSummary = TaxService.getTaxSummaryFromInvoices(invoices);
    const vatCashBasis = TaxService.getVatLiabilityFromPaymentsCashBasis({ invoices, payments });
    
    const profit = revenue - expenseTotal;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      revenue,
      expenses: expenseTotal,
      profit,
      profitMargin,
      outstandingInvoices,
      accountsPayable: 0,
      totalTax: taxSummary.totalTax,
      totalBeforeTax: taxSummary.totalBeforeTax,
      taxByRate: taxSummary.byTaxRateArray,
      vatCashBasisDue: vatCashBasis.vatDue,
      vatCashBasisGrossPayments: vatCashBasis.grossPayments,
      vatCashBasisNetPayments: vatCashBasis.netPayments,
    };
  }, [invoices, expenses, payments]);

  const chartData = useMemo(() => {
    const byMonth = {};
    const now = new Date();

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(date, 'MMM');
      byMonth[key] = { month: key, revenue: 0, expenses: 0, profit: 0 };
    }

    invoices.forEach((inv) => {
      const date = new Date(inv.created_date || inv.date || Date.now());
      const key = format(date, 'MMM');
      if (!byMonth[key]) return;
      if (inv.status === 'paid' || inv.status === 'partial_paid') {
        byMonth[key].revenue += inv.total_amount || 0;
      }
    });

    expenses.forEach((exp) => {
      const date = new Date(exp.date || exp.created_date || Date.now());
      const key = format(date, 'MMM');
      if (!byMonth[key]) return;
      byMonth[key].expenses += exp.amount || 0;
    });

    Object.values(byMonth).forEach((entry) => {
      entry.profit = entry.revenue - entry.expenses;
    });

    return Object.values(byMonth);
  }, [invoices, expenses]);

  const categoryData = useMemo(() => {
    const categoryTotals = expenses.reduce((acc, exp) => {
      const key = exp.category || 'other';
      acc[key] = (acc[key] || 0) + (exp.amount || 0);
      return acc;
    }, {});

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [expenses]);

  const recentInvoices = useMemo(
    () => invoices.slice(0, 5),
    [invoices]
  );

  const recentExpenses = useMemo(
    () => expenses.slice(0, 5),
    [expenses]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary/10 to-primary/5">
        <div className="max-w-7xl mx-auto p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-4 w-24 bg-slate-200 rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 bg-slate-200 rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary/10 to-primary/5">
      <div className="max-w-7xl mx-auto p-6 sm:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-[#ff7c00] rounded-xl flex items-center justify-center">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Accounting</h1>
              <p className="text-slate-600">Manage your financial records and analytics</p>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(financialData.revenue, userCurrency)}</div>
              <p className="text-xs text-emerald-600 mt-1">+12% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Total Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(financialData.expenses, userCurrency)}</div>
              <p className="text-xs text-red-600 mt-1">+5% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Net Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(financialData.profit, userCurrency)}</div>
              <p className="text-xs text-emerald-600 mt-1">{financialData.profitMargin.toFixed(1)}% profit margin</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Outstanding Receivables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{formatCurrency(financialData.outstandingInvoices, userCurrency)}</div>
              <p className="text-xs text-amber-600 mt-1">Awaiting payment</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different views */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border border-slate-200">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="income">Income Statement</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="tax">Tax Report</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Expenses Trend</CardTitle>
                <CardDescription>Monthly financial overview</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Month</CardTitle>
                  <CardDescription>Year-to-date breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                        formatter={(value) => formatCurrency(value, userCurrency)}
                      />
                      <Bar dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Profit by Month</CardTitle>
                  <CardDescription>Year-to-date breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                        formatter={(value) => formatCurrency(value, userCurrency)}
                      />
                      <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Income Statement Tab */}
          <TabsContent value="income" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Income Statement</CardTitle>
                <CardDescription>Detailed revenue and profit analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-900">Total Revenue</span>
                    <span className="text-lg font-bold text-emerald-600">{formatCurrency(financialData.revenue, userCurrency)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg">
                    <span className="font-semibold text-slate-900">Total Expenses</span>
                    <span className="text-lg font-bold text-red-600">{formatCurrency(financialData.expenses, userCurrency)}</span>
                  </div>
                  <div className="border-t-2 border-slate-200 my-4"></div>
                  <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-lg">
                    <span className="font-bold text-slate-900">Net Income</span>
                    <span className="text-lg font-bold text-emerald-600">{formatCurrency(financialData.profit, userCurrency)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Expense Breakdown</CardTitle>
                <CardDescription>Distribution of expenses by category</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChartComponent>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(value, userCurrency)}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value, userCurrency)} />
                  </PieChartComponent>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categoryData.map((category, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        ></div>
                        <span className="font-medium text-slate-900">{category.name}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{formatCurrency(category.value, userCurrency)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tax Report Tab */}
          <TabsContent value="tax" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Total Tax Collected</CardTitle>
                  <CardDescription>Across all invoices</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900 mb-2">
                    {formatCurrency(financialData.totalTax, userCurrency)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Income before tax</span>
                      <span className="font-medium">{formatCurrency(financialData.totalBeforeTax, userCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Effective tax rate</span>
                      <span className="font-medium">
                        {financialData.totalBeforeTax > 0 
                          ? ((financialData.totalTax / financialData.totalBeforeTax) * 100).toFixed(1) 
                          : '0'}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tax Summary Statistics</CardTitle>
                  <CardDescription>Quick overview</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total invoices</span>
                    <span className="font-semibold">{invoices.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Different tax rates used</span>
                    <span className="font-semibold">{financialData.taxByRate.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Highest tax rate</span>
                    <span className="font-semibold">
                      {financialData.taxByRate.length > 0 
                        ? financialData.taxByRate[financialData.taxByRate.length - 1].rate 
                        : 0}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {financialData.taxByRate.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tax Breakdown by Rate</CardTitle>
                  <CardDescription>Invoices grouped by tax rate</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {financialData.taxByRate.map((taxInfo, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-semibold text-slate-900">{taxInfo.rate}% VAT</p>
                          <p className="text-xs text-slate-500">{taxInfo.count} invoice{taxInfo.count !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(taxInfo.taxAmount, userCurrency)}
                          </div>
                          <div className="text-xs text-slate-500">
                            from {formatCurrency(taxInfo.subtotal, userCurrency)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Tax Liability</CardTitle>
                <CardDescription>Total taxes owed to authorities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800 mb-2">
                    VAT due on a payments (cash) basis (calculated from payments received).
                  </p>
                  <p className="text-2xl font-bold text-amber-900">
                    {formatCurrency(financialData.vatCashBasisDue, userCurrency)}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-amber-800">
                    <div className="flex justify-between">
                      <span>Gross payments received</span>
                      <span className="font-medium">{formatCurrency(financialData.vatCashBasisGrossPayments, userCurrency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Net (ex VAT)</span>
                      <span className="font-medium">{formatCurrency(financialData.vatCashBasisNetPayments, userCurrency)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    * This is a best-effort VAT calculation based on recorded payments and invoice VAT rates.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-600" />
                    Financial Reports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">Generate comprehensive financial reports</p>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">Generate Report</Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" />
                    Tax Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">View tax-related information</p>
                  <Button className="w-full bg-primary hover:bg-primary/90">View Summary</Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-emerald-600" />
                    Profit & Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">Detailed P&L analysis</p>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700">View P&L</Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-orange-600" />
                    Cash Flow
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">Monitor cash flow trends</p>
                  <Button className="w-full bg-orange-600 hover:bg-orange-700">View Flow</Button>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Invoices</CardTitle>
                  <CardDescription>Latest activity from your invoices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentInvoices.length === 0 && (
                    <p className="text-sm text-slate-500">No invoices yet.</p>
                  )}
                  {recentInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                      <div>
                        <p className="font-semibold text-slate-900">#{inv.invoice_number}</p>
                        <p className="text-xs text-slate-500">{format(new Date(inv.created_date), 'MMM d, yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{formatCurrency(inv.total_amount || 0, userCurrency)}</p>
                        <p className="text-xs text-slate-500 capitalize">{inv.status}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent Expenses</CardTitle>
                  <CardDescription>Latest expense entries</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentExpenses.length === 0 && (
                    <p className="text-sm text-slate-500">No expenses recorded.</p>
                  )}
                  {recentExpenses.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                      <div>
                        <p className="font-semibold text-slate-900">{exp.description || 'Expense'}</p>
                        <p className="text-xs text-slate-500">{format(new Date(exp.date), 'MMM d, yyyy')} · {exp.category || 'other'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{formatCurrency(exp.amount || 0, userCurrency)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

AccountingDashboard.propTypes = {
  user: PropTypes.shape({
    currency: PropTypes.string,
  }),
};
