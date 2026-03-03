import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Invoice } from '@/api/entities';
import { User } from '@/api/entities';
import { Expense } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import { exportDataAsCSV } from '@/services/AdminCommonService';
import {
  FileText,
  Calendar,
  PieChart,
  BarChart3,
  ArrowRight,
  DollarSign,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';

export default function Reports() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional run once on mount
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [invoicesData, userData, expensesData] = await Promise.all([
        Invoice.list('-created_date'),
        User.me(),
        Expense.list('-date', 500),
      ]);
      setInvoices(invoicesData || []);
      setUser(userData);
      setExpenses(expensesData || []);
    } catch (error) {
      console.error('Error loading reports data:', error);
      toast({
        title: 'Could not load reports',
        description: error?.message || 'Please check your connection and try again.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  };

  const openReport = (params) => {
    const search = new URLSearchParams(params).toString();
    navigate(`/ReportPDF?${search}`);
  };

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const paidThisMonth = invoices.filter(
    (inv) =>
      (inv.status === 'paid' || inv.status === 'partial_paid') &&
      inv.updated_date &&
      new Date(inv.updated_date) >= thisMonthStart &&
      new Date(inv.updated_date) <= thisMonthEnd
  ).length;
  const totalInvoices = invoices.length;

  // Unified data for consolidated analytics (revenue from paid/partial invoices, expenses from Expense list)
  const revenueAll = invoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'partial_paid')
    .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
  const expensesAll = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const profitAll = revenueAll - expensesAll;
  const marginPercentAll = revenueAll > 0 ? Math.round(((profitAll / revenueAll) * 100)) : 0;

  const revenueMonth = invoices
    .filter((inv) => {
      const d = new Date(inv.updated_date || inv.created_date);
      return (inv.status === 'paid' || inv.status === 'partial_paid') && d >= thisMonthStart && d <= thisMonthEnd;
    })
    .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
  const expensesMonth = expenses
    .filter((exp) => {
      const d = new Date(exp.date);
      return d >= thisMonthStart && d <= thisMonthEnd;
    })
    .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const profitMonth = revenueMonth - expensesMonth;
  const marginPercentMonth = revenueMonth > 0 ? Math.round(((profitMonth / revenueMonth) * 100)) : 0;

  const thisQuarterStart = startOfQuarter(now);
  const thisQuarterEnd = endOfQuarter(now);
  const revenueQuarter = invoices
    .filter((inv) => {
      const d = new Date(inv.updated_date || inv.created_date);
      return (inv.status === 'paid' || inv.status === 'partial_paid') && d >= thisQuarterStart && d <= thisQuarterEnd;
    })
    .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
  const expensesQuarter = expenses
    .filter((exp) => {
      const d = new Date(exp.date);
      return d >= thisQuarterStart && d <= thisQuarterEnd;
    })
    .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const profitQuarter = revenueQuarter - expensesQuarter;
  const marginPercentQuarter = revenueQuarter > 0 ? Math.round(((profitQuarter / revenueQuarter) * 100)) : 0;

  const userCurrency = user?.currency || 'ZAR';

  const handleExportConsolidated = () => {
    const rows = [
      { period: 'This month', revenue: revenueMonth, expenses: expensesMonth, profit: profitMonth, margin_percent: marginPercentMonth },
      { period: 'This quarter', revenue: revenueQuarter, expenses: expensesQuarter, profit: profitQuarter, margin_percent: marginPercentQuarter },
      { period: 'All time', revenue: revenueAll, expenses: expensesAll, profit: profitAll, margin_percent: marginPercentAll },
    ];
    exportDataAsCSV(rows, `consolidated_report_${format(now, 'yyyy-MM-dd')}.csv`, ['period', 'revenue', 'expenses', 'profit', 'margin_percent']);
    toast({ title: 'Report downloaded', description: 'Consolidated report (CSV) saved.', variant: 'default' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">Reports</h1>
          <p className="text-sm text-muted-foreground">
            View and download income, expense, and custom reports.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Income &amp; expense report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Full P&amp;L style report with date range and optional filters.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => openReport({ range: 'month' })}
                >
                  This month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => openReport({ range: 'quarter' })}
                >
                  Last quarter
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => openReport({ range: 'year' })}
                >
                  This year
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => openReport({ range: 'all' })}
                >
                  All time
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Cash flow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Income, expenses, and net cash flow with charts and export.
              </p>
              <Link to={createPageUrl('CashFlow')}>
                <Button variant="outline" size="sm" className="rounded-lg w-full sm:w-auto">
                  Open Cash Flow
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieChart className="h-4 w-4 text-primary" />
                Invoice summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Total invoices: <span className="font-medium text-foreground">{totalInvoices}</span>
                    {paidThisMonth > 0 && (
                      <span className="block mt-1">
                        Paid this month: <span className="font-medium text-foreground">{paidThisMonth}</span>
                      </span>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => openReport({ range: 'month', status: 'paid' })}
                  >
                    Paid report (month)
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Consolidated report: unified KPIs and margin */}
        <Card className="mt-8 rounded-xl border border-border shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Consolidated analytics
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Unified revenue, expenses, profit and margin across periods. Data from invoices and expenses.
                </p>
              </div>
              <Button variant="outline" size="sm" className="rounded-lg gap-2" onClick={handleExportConsolidated}>
                <Download className="h-4 w-4" />
                Download consolidated (CSV)
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This month</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(revenueMonth, userCurrency)}</span>
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(expensesMonth, userCurrency)}</span>
                    <span className="text-muted-foreground">Profit</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(profitMonth, userCurrency)}</span>
                    <span className="text-muted-foreground">Margin</span>
                    <span className="font-semibold tabular-nums">{revenueMonth > 0 ? `${marginPercentMonth}%` : '—'}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">This quarter</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(revenueQuarter, userCurrency)}</span>
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(expensesQuarter, userCurrency)}</span>
                    <span className="text-muted-foreground">Profit</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(profitQuarter, userCurrency)}</span>
                    <span className="text-muted-foreground">Margin</span>
                    <span className="font-semibold tabular-nums">{revenueQuarter > 0 ? `${marginPercentQuarter}%` : '—'}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">All time</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Revenue</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(revenueAll, userCurrency)}</span>
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(expensesAll, userCurrency)}</span>
                    <span className="text-muted-foreground">Profit</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(profitAll, userCurrency)}</span>
                    <span className="text-muted-foreground">Margin</span>
                    <span className="font-semibold tabular-nums">{revenueAll > 0 ? `${marginPercentAll}%` : '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-8 rounded-xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Custom date range
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Generate a report for a specific period. Open the report page and use custom from/to
              parameters, or use the filters on the report view.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              variant="default"
              className="rounded-xl"
              onClick={() =>
                openReport({
                  range: 'custom',
                  from: format(subMonths(now, 1), 'yyyy-MM-dd'),
                  to: format(now, 'yyyy-MM-dd'),
                })
              }
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Last 30 days report
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
