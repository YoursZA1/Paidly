import { useMemo, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFocusPolicy } from '@/core/query/queryFocusPolicy';
import { useAppStore } from '@/stores/useAppStore';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createPageUrl } from '@/utils';
import { formatCurrency } from '@/utils/currencyCalculations';
import { exportToCsv } from '@/utils/downloadFile';
import {
  FileText,
  Calendar,
  PieChart,
  BarChart3,
  ArrowRight,
  DollarSign,
  Download,
} from 'lucide-react';
import { format, startOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { CASHFLOW_PAGE_QUERY_KEY, fetchCashFlowPageData } from '@/utils/cashFlowData';
import { buildMoneyTotals, getReportPeriodBounds, inDayRange } from '@/utils/cashFlowTruth';
import { summarizePosSales } from '@/utils/posSalesTruth';
import PosSalesReportCard from '@/components/reports/PosSalesReportCard';
import PurchasingReportCard from '@/components/reports/PurchasingReportCard';
import { useEntitlementAccess } from '@/hooks/useEntitlementAccess';
import { fetchPurchaseOrderHeaders, fetchSupplierPaymentsBetween } from '@/services/purchaseOrderQueries';
import { summarizePurchaseOrders } from '@shared/procurement/purchaseOrderMath.js';

export default function Reports() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const storeInvoices = useAppStore((s) => s.invoices);
  const storeExpenses = useAppStore((s) => s.expenses);
  const storePayments = useAppStore((s) => s.payments);
  const storeUser = useAppStore((s) => s.userProfile);
  const setExpensesInStore = useAppStore((s) => s.setExpenses);
  const setInvoicesInStore = useAppStore((s) => s.setInvoices);
  const setPaymentsInStore = useAppStore((s) => s.setPayments);
  const { profile, authUserId } = useAuth();
  const hasStoreData = (storeInvoices?.length > 0) || (storeExpenses?.length > 0) || (storePayments?.length > 0) || storeUser != null;
  const [consolidatedFallbackUrl, setConsolidatedFallbackUrl] = useState(null);
  const [consolidatedFallbackName, setConsolidatedFallbackName] = useState("");
  const consolidatedFallbackUrlRef = useRef(null);
  consolidatedFallbackUrlRef.current = consolidatedFallbackUrl;
  useEffect(() => () => { if (consolidatedFallbackUrlRef.current) URL.revokeObjectURL(consolidatedFallbackUrlRef.current); }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: [...CASHFLOW_PAGE_QUERY_KEY, authUserId ?? null],
    queryFn: () => fetchCashFlowPageData(profile),
    staleTime: 60 * 1000,
    refetchOnMount: true,
    placeholderData: hasStoreData
      ? {
          expenses: storeExpenses ?? [],
          invoices: storeInvoices ?? [],
          payments: storePayments ?? [],
          posSales: [],
          user: profile ?? storeUser ?? null,
        }
      : undefined,
    ...getFocusPolicy("cashflow-page"),
  });

  useEffect(() => {
    if (error) {
      toast({
        title: 'Could not load reports',
        description: error?.message || 'Please check your connection and try again.',
        variant: 'destructive',
      });
    }
  }, [error, toast]);

  useEffect(() => {
    if (data?.expenses) setExpensesInStore(data.expenses);
    if (data?.invoices) setInvoicesInStore(data.invoices);
    if (data?.payments) setPaymentsInStore(data.payments);
  }, [data?.expenses, data?.invoices, data?.payments, setExpensesInStore, setInvoicesInStore, setPaymentsInStore]);

  const invoices = data?.invoices ?? storeInvoices ?? [];
  const expenses = storeExpenses ?? data?.expenses ?? [];
  const payments = data?.payments ?? storePayments ?? [];
  const posSales = data?.posSales ?? [];
  const payRuns = data?.payRuns ?? [];
  const payslips = data?.payslips ?? [];
  const user = data?.user ?? profile ?? storeUser ?? null;

  const openReport = (params) => {
    const search = new URLSearchParams(params).toString();
    navigate(`/ReportPDF?${search}`);
  };

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const monthBounds = getReportPeriodBounds('month', now);
  const quarterBounds = getReportPeriodBounds('quarter', now);

  const monthTotals = useMemo(
    () => buildMoneyTotals({ payments, expenses, invoices, posSales, payslips, payRuns, ...monthBounds }),
    [payments, expenses, invoices, posSales, payslips, payRuns, monthBounds.start, monthBounds.end]
  );
  const quarterTotals = useMemo(
    () => buildMoneyTotals({ payments, expenses, invoices, posSales, payslips, payRuns, ...quarterBounds }),
    [payments, expenses, invoices, posSales, payslips, payRuns, quarterBounds.start, quarterBounds.end]
  );
  const allTotals = useMemo(
    () => buildMoneyTotals({ payments, expenses, invoices, posSales, payslips, payRuns }),
    [payments, expenses, invoices, posSales, payslips, payRuns]
  );

  const posMonth = useMemo(
    () => summarizePosSales(posSales, monthBounds),
    [posSales, monthBounds.start, monthBounds.end]
  );
  const posToday = useMemo(() => {
    const day = startOfDay(now);
    return summarizePosSales(posSales, { start: day, end: day });
  }, [posSales, thisMonthStart]);

  const paidThisMonth = useMemo(() => {
    const ids = new Set(
      monthTotals.incomeEvents
        .filter((row) => inDayRange(row.date, thisMonthStart, thisMonthEnd) && row.invoiceId)
        .map((row) => row.invoiceId)
    );
    return ids.size;
  }, [monthTotals.incomeEvents, thisMonthStart, thisMonthEnd]);
  const totalInvoices = invoices.length;

  const revenueAll = allTotals.income;
  const expensesAll = allTotals.expenses;
  const payrollAll = allTotals.payroll;
  const profitAll = allTotals.profit;
  const marginPercentAll = allTotals.marginPercent;

  const revenueMonth = monthTotals.income;
  const expensesMonth = monthTotals.expenses;
  const payrollMonth = monthTotals.payroll;
  const profitMonth = monthTotals.profit;
  const marginPercentMonth = monthTotals.marginPercent;

  const revenueQuarter = quarterTotals.income;
  const expensesQuarter = quarterTotals.expenses;
  const payrollQuarter = quarterTotals.payroll;
  const profitQuarter = quarterTotals.profit;
  const marginPercentQuarter = quarterTotals.marginPercent;

  const userCurrency = user?.currency || 'ZAR';

  // Purchasing: commitments / payables / upcoming / paid kept as four separate figures.
  const { hasFeature: planHasFeature } = useEntitlementAccess();
  const hasPurchaseOrders = planHasFeature('purchase_orders');
  const monthStartIso = format(thisMonthStart, 'yyyy-MM-dd');
  const monthEndIso = format(thisMonthEnd, 'yyyy-MM-dd');
  const { data: purchasing } = useQuery({
    queryKey: ['reports', 'purchasing', authUserId ?? null, monthStartIso],
    queryFn: async () => {
      const [orders, paidRows] = await Promise.all([
        fetchPurchaseOrderHeaders({ statuses: ['approved', 'partially_received', 'received', 'cancelled'] }),
        fetchSupplierPaymentsBetween(monthStartIso, monthEndIso),
      ]);
      const paidCents = paidRows.reduce((sum, row) => sum + Math.round(Number(row.amount || 0) * 100), 0);
      return { summary: summarizePurchaseOrders(orders), paidThisMonth: paidCents / 100, hasOrders: orders.length > 0 };
    },
    enabled: hasPurchaseOrders,
    staleTime: 60 * 1000,
  });

  const handleExportConsolidated = () => {
    if (consolidatedFallbackUrl) {
      URL.revokeObjectURL(consolidatedFallbackUrl);
      setConsolidatedFallbackUrl(null);
    }
    const rows = [
      { period: 'This month', revenue: revenueMonth, expenses: expensesMonth, payroll: payrollMonth, profit: profitMonth, margin_percent: marginPercentMonth },
      { period: 'This quarter', revenue: revenueQuarter, expenses: expensesQuarter, payroll: payrollQuarter, profit: profitQuarter, margin_percent: marginPercentQuarter },
      { period: 'All time', revenue: revenueAll, expenses: expensesAll, payroll: payrollAll, profit: profitAll, margin_percent: marginPercentAll },
    ];
    const filename = `consolidated_report_${format(now, 'yyyy-MM-dd')}.csv`;
    const { url } = exportToCsv(rows, filename, ['period', 'revenue', 'expenses', 'payroll', 'profit', 'margin_percent']);
    if (url) {
      setConsolidatedFallbackUrl(url);
      setConsolidatedFallbackName(filename);
    }
    toast({ title: 'Report downloaded', description: 'Consolidated report (CSV) saved. Use the Download button if the file didn\'t save automatically.', variant: 'default' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 page-header-sticky">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground mb-1 font-display">Reports</h1>
          <p className="text-sm text-muted-foreground">
            View and download income, expense, till, and custom reports.
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
                  This quarter
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

        <div className="mt-8">
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <PosSalesReportCard
              title="POS sales"
              subtitle="This month on the till. Today's sales is calendar today. Same pos_sales_events feed as cash flow — not a separate report engine."
              summary={{ ...posMonth, today_sales: posToday.net_sales }}
              currency={userCurrency}
            />
          )}
        </div>

        {purchasing?.hasOrders && (
          <div className="mt-8">
            <PurchasingReportCard summary={purchasing.summary} paidThisMonth={purchasing.paidThisMonth} currency={userCurrency} />
          </div>
        )}

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
                  Unified revenue, expenses, profit and margin across periods. Cash basis: settled payments and till sales in. Recorded expenses and issued payroll (net pay) out. Payroll already matched to a salary expense is counted once.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="rounded-lg gap-2" onClick={handleExportConsolidated}>
                  <Download className="h-4 w-4" />
                  Download consolidated (CSV)
                </Button>
                {consolidatedFallbackUrl && (
                  <Button variant="secondary" size="sm" className="rounded-lg gap-2" asChild>
                    <a href={consolidatedFallbackUrl} download={consolidatedFallbackName}>
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                )}
              </div>
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
                    <span className="text-muted-foreground">Payroll included</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(payrollMonth, userCurrency)}</span>
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
                    <span className="text-muted-foreground">Payroll included</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(payrollQuarter, userCurrency)}</span>
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
                    <span className="text-muted-foreground">Payroll included</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(payrollAll, userCurrency)}</span>
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
                  from: format(subDays(now, 30), 'yyyy-MM-dd'),
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
