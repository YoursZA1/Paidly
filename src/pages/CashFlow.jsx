import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Expense, Invoice, Payment } from "@/api/entities";
import { useAppStore } from "@/stores/useAppStore";
import { expensesToCsv, parseExpenseCsv, csvRowToExpensePayload } from "@/utils/expenseCsvMapping";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Download,
  DollarSign,
  Plus,
  ScanLine,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  addDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import ExpenseForm from "@/components/cashflow/ExpenseForm";
import ExpenseList from "@/components/cashflow/ExpenseList";
import ReceiptScanner from "@/components/cashflow/ReceiptScanner";
import BankImportModal from "@/components/cashflow/BankImportModal";
import CashFlowKpiCard from "@/components/cashflow/CashFlowKpiCard";
import CashPositionCard from "@/components/cashflow/CashPositionCard";
import CashFlowOverTimeChart from "@/components/cashflow/CashFlowOverTimeChart";
import UpcomingCashEventsPanel from "@/components/cashflow/UpcomingCashEventsPanel";
import InsightTiles from "@/components/cashflow/InsightTiles";
import ExpenseFilters, { applyExpenseFilters } from "@/components/filters/ExpenseFilters";
import CashFlowAccuracy from "@/components/cashflow/CashFlowAccuracy";
import PaymentTimingAnalysis from "@/components/payments/PaymentTimingAnalysis";
import OverduePaymentTracker from "@/components/payments/OverduePaymentTracker";
import PaymentMethodAnalytics from "@/components/payments/PaymentMethodAnalytics";
import OutstandingBalanceDashboard from "@/components/payments/OutstandingBalanceDashboard";
import { createPageUrl } from "@/utils";
import {
  buildCashFlowInsights,
  buildCashFlowKpis,
  buildCashPositionModel,
  buildUpcomingCashEvents,
} from "@/utils/cashFlowViewModels";
import { useToast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

const CASHFLOW_PAGE_QUERY_KEY = ['cashflow-page'];

const CASHFLOW_LIST_OPTS = { limit: 100, maxWaitMs: 4000 };

async function fetchCashFlowPageData(profile) {
    const [expensesData, invoicesData, paymentsData] = await Promise.all([
        Expense.list("-date", CASHFLOW_LIST_OPTS),
        Invoice.list("-created_date", CASHFLOW_LIST_OPTS),
        Payment.list("-payment_date", CASHFLOW_LIST_OPTS),
    ]);
    return {
        expenses: expensesData || [],
        invoices: invoicesData || [],
        payments: paymentsData || [],
        user: profile || null,
    };
}

export default function CashFlowPage() {
    const { toast } = useToast();
    const { profile, authUserId } = useAuth();
    const queryClient = useQueryClient();
    const setExpensesInStore = useAppStore((s) => s.setExpenses);
    const storeExpensesForInit = useAppStore((s) => s.expenses);
    const storeInvoices = useAppStore((s) => s.invoices);
    const storePayments = useAppStore((s) => s.payments);
    const storeUser = useAppStore((s) => s.userProfile);
    const hasStoreData = (storeExpensesForInit?.length > 0) || (storeInvoices?.length > 0) || (storePayments?.length > 0) || storeUser != null;
    const { data, isLoading, error } = useQuery({
        queryKey: [...CASHFLOW_PAGE_QUERY_KEY, authUserId ?? null],
        queryFn: () => fetchCashFlowPageData(profile),
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: true,
        initialData: hasStoreData
            ? {
                expenses: storeExpensesForInit ?? [],
                invoices: storeInvoices ?? [],
                payments: storePayments ?? [],
                user: storeUser ?? null,
            }
            : undefined,
    });
    const payments = data?.payments ?? storePayments ?? [];
    const invoices = data?.invoices ?? storeInvoices ?? [];
    const user = data?.user ?? storeUser ?? null;

    useEffect(() => {
        if (data?.expenses) setExpensesInStore(data.expenses);
    }, [data?.expenses, setExpensesInStore]);

    const setPaymentsInStore = useAppStore((s) => s.setPayments);
    const setInvoicesInStore = useAppStore((s) => s.setInvoices);
    useEffect(() => {
        if (data?.payments != null) setPaymentsInStore(data.payments);
        if (data?.invoices != null) setInvoicesInStore(data.invoices);
    }, [data?.payments, data?.invoices, setPaymentsInStore, setInvoicesInStore]);

    const storeExpenses = useAppStore((s) => s.expenses);
    const addExpenseToStore = useAppStore((s) => s.addExpense);
    const updateExpenseInStore = useAppStore((s) => s.updateExpense);
    const deleteExpenseFromStore = useAppStore((s) => s.deleteExpense);
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [showReceiptScanner, setShowReceiptScanner] = useState(false);
    const [expenseFormFromScan, setExpenseFormFromScan] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [timeRange, setTimeRange] = useState("30D"); // 7D | 30D | 6M | 12M
    const [quickFilter, setQuickFilter] = useState("thisMonth"); // thisMonth | lastMonth
    const [kpiFilter, setKpiFilter] = useState("all");
    const [expenseFilters, setExpenseFilters] = useState({});
    const [activeTab, setActiveTab] = useState('overview');
    const [isExportingExpenses, setIsExportingExpenses] = useState(false);
    const [isImportingExpenses, setIsImportingExpenses] = useState(false);
    const expenseFileInputRef = useRef(null);

    const invalidateCashFlow = () => queryClient.invalidateQueries({ queryKey: CASHFLOW_PAGE_QUERY_KEY });

    useEffect(() => {
        if (error) {
            toast({
                title: "Could not load cash flow data",
                description: error?.message || "Please check your connection and try again.",
                variant: "destructive",
            });
        }
    }, [error, toast]);

    const handleExportExpenseCsv = async () => {
        setIsExportingExpenses(true);
        try {
            const list = await Expense.list("-date");
            if (!list?.length) {
                toast({ title: "No expenses to export", variant: "destructive" });
                return;
            }
            const csv = expensesToCsv(list);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "Expense_export.csv";
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: "Export complete", description: `${list.length} expense(s) exported.`, variant: "default" });
        } catch (error) {
            toast({ title: "Export failed", description: error?.message || "Failed to export.", variant: "destructive" });
        }
        setIsExportingExpenses(false);
    };

    const handleImportExpenseCsv = (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setIsImportingExpenses(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const text = ev.target?.result ?? "";
                const { headers, rows } = parseExpenseCsv(text);
                if (!headers?.length || !rows?.length) {
                    toast({ title: "Import failed", description: "CSV is empty or invalid.", variant: "destructive" });
                    return;
                }
                let created = 0;
                for (const row of rows) {
                    const payload = csvRowToExpensePayload(headers, row);
                    await Expense.create(payload);
                    created++;
                }
                toast({ title: "Import complete", description: `${created} expense(s) imported.`, variant: "default" });
                invalidateCashFlow();
            } catch (err) {
                toast({ title: "Import failed", description: err?.message || "Could not parse CSV.", variant: "destructive" });
            }
            setIsImportingExpenses(false);
            if (expenseFileInputRef.current) expenseFileInputRef.current.value = "";
        };
        reader.readAsText(file, "UTF-8");
    };

    const userCurrency = user?.currency || 'ZAR';

    const now = new Date();
    const monthRange = useMemo(() => {
      if (quickFilter === "lastMonth") {
        const start = startOfMonth(subMonths(now, 1));
        const end = endOfMonth(subMonths(now, 1));
        return { start, end };
      }
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }, [quickFilter, now]);

    const monthlyIncome = payments
      .filter((p) => p.payment_date && isAfter(parseISO(p.payment_date), monthRange.start) && isBefore(parseISO(p.payment_date), addDays(monthRange.end, 1)))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const monthlyExpenses = (storeExpenses || [])
      .filter((e) => e.date && isAfter(parseISO(e.date), monthRange.start) && isBefore(parseISO(e.date), addDays(monthRange.end, 1)))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const netCashFlow = monthlyIncome - monthlyExpenses;

    const outstandingInvoices = invoices
      .filter((inv) => String(inv.status || "").toLowerCase() !== "paid")
      .reduce((sum, inv) => sum + (Number(inv.total_amount ?? inv.grand_total ?? 0) || 0), 0);

    const previousMonthRange = {
      start: startOfMonth(subMonths(monthRange.start, 1)),
      end: endOfMonth(subMonths(monthRange.start, 1)),
    };

    const prevIncome = payments
      .filter((p) => p.payment_date && isAfter(parseISO(p.payment_date), previousMonthRange.start) && isBefore(parseISO(p.payment_date), addDays(previousMonthRange.end, 1)))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const prevExpenses = (storeExpenses || [])
      .filter((e) => e.date && isAfter(parseISO(e.date), previousMonthRange.start) && isBefore(parseISO(e.date), addDays(previousMonthRange.end, 1)))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const prevNet = prevIncome - prevExpenses;
    const netTrendPct = prevNet === 0 ? 0 : ((netCashFlow - prevNet) / Math.abs(prevNet)) * 100;

    const projectionStart = now;
    const projectionEnd = addDays(now, 30);
    const incomingProjection = invoices
      .filter((inv) => {
        const raw = inv.due_date || inv.delivery_date;
        if (!raw) return false;
        const due = parseISO(raw);
        return isAfter(due, projectionStart) && isBefore(due, addDays(projectionEnd, 1)) && String(inv.status || "").toLowerCase() !== "paid";
      })
      .reduce((sum, inv) => sum + (Number(inv.total_amount ?? inv.grand_total ?? 0) || 0), 0);
    const outgoingProjection = (storeExpenses || [])
      .filter((exp) => exp.date && isAfter(parseISO(exp.date), projectionStart) && isBefore(parseISO(exp.date), addDays(projectionEnd, 1)))
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    const netProjection = incomingProjection - outgoingProjection;

    const chartConfig = {
      "7D": { points: 7, bucket: "day" },
      "30D": { points: 30, bucket: "day" },
      "6M": { points: 6, bucket: "month" },
      "12M": { points: 12, bucket: "month" },
    };

    const chartData = useMemo(() => {
      const conf = chartConfig[timeRange];
      const rows = [];
      if (conf.bucket === "day") {
        for (let i = conf.points - 1; i >= 0; i -= 1) {
          const date = subMonths(now, 0);
          const day = addDays(startOfMonth(date), (new Date().getDate() - 1) - i);
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = addDays(dayStart, 1);
          const income = payments
            .filter((p) => p.payment_date && isAfter(parseISO(p.payment_date), dayStart) && isBefore(parseISO(p.payment_date), dayEnd))
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const expenses = (storeExpenses || [])
            .filter((e) => e.date && isAfter(parseISO(e.date), dayStart) && isBefore(parseISO(e.date), dayEnd))
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
          rows.push({
            label: format(dayStart, "MMM d"),
            income,
            expenses,
            net: income - expenses,
          });
        }
        return rows;
      }

      for (let i = conf.points - 1; i >= 0; i -= 1) {
        const month = subMonths(now, i);
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        const income = payments
          .filter((p) => p.payment_date && isAfter(parseISO(p.payment_date), monthStart) && isBefore(parseISO(p.payment_date), addDays(monthEnd, 1)))
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const expenses = (storeExpenses || [])
          .filter((e) => e.date && isAfter(parseISO(e.date), monthStart) && isBefore(parseISO(e.date), addDays(monthEnd, 1)))
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        rows.push({
          label: format(month, "MMM yyyy"),
          income,
          expenses,
          net: income - expenses,
        });
      }
      return rows;
    }, [payments, storeExpenses, timeRange, now]);

    const upcomingCashEvents = useMemo(
      () =>
        buildUpcomingCashEvents({
          invoices,
          expenses: storeExpenses || [],
          now,
          windowDays: 30,
        }).slice(0, 10),
      [invoices, storeExpenses, now]
    );

    const insights = useMemo(
      () =>
        buildCashFlowInsights({
          monthlyExpenses,
          prevExpenses,
          outstandingInvoices,
          netCashFlow,
          prevNet,
          quickFilter,
          userCurrency,
        }),
      [monthlyExpenses, prevExpenses, outstandingInvoices, netCashFlow, prevNet, quickFilter, userCurrency]
    );

    const kpiModels = useMemo(
      () =>
        buildCashFlowKpis({
          netCashFlow,
          netTrendPct,
          monthlyIncome,
          monthlyExpenses,
          outstandingInvoices,
        }),
      [netCashFlow, netTrendPct, monthlyIncome, monthlyExpenses, outstandingInvoices]
    );

    const cashPositionModel = useMemo(
      () =>
        buildCashPositionModel({
          currentBalance: netCashFlow,
          incomingProjection,
          outgoingProjection,
          netProjection,
        }),
      [netCashFlow, incomingProjection, outgoingProjection, netProjection]
    );

    const filteredTransactions = useMemo(() => {
      if (kpiFilter === "all") return applyExpenseFilters(storeExpenses || [], expenseFilters);
      if (kpiFilter === "moneyOut") return applyExpenseFilters(storeExpenses || [], expenseFilters);
      if (kpiFilter === "outstanding") return [];
      return applyExpenseFilters(storeExpenses || [], expenseFilters);
    }, [storeExpenses, expenseFilters, kpiFilter]);

    const handleSaveExpense = async (expenseData) => {
        try {
            if (editingExpense && editingExpense.id) {
                await updateExpenseInStore(editingExpense.id, expenseData);
            } else {
                await addExpenseToStore(expenseData);
            }
            setShowExpenseForm(false);
            setEditingExpense(null);
            setExpenseFormFromScan(false);
            toast({
                title: editingExpense ? "Expense updated" : "Expense added",
                variant: "default",
            });
        } catch (error) {
            console.error("Error saving expense:", error);
            toast({
                title: "Could not save expense",
                description: error?.message || "Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleEditExpense = (expense) => {
        setEditingExpense(expense);
        setExpenseFormFromScan(false);
        setShowExpenseForm(true);
    };

    const handleDeleteExpense = async (expenseId) => {
        try {
            await deleteExpenseFromStore(expenseId);
            toast({ title: "Expense deleted", variant: "default" });
        } catch (error) {
            console.error("Error deleting expense:", error);
            toast({
                title: "Could not delete expense",
                description: error?.message || "Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleScanComplete = (scannedData) => {
        setEditingExpense(scannedData);
        setExpenseFormFromScan(true);
        setShowReceiptScanner(false);
        setShowExpenseForm(true);
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full min-w-0 h-full overflow-x-hidden mobile-page bg-background"
        >
            <div className="responsive-page-shell py-4 sm:py-6 md:py-8 space-y-6 min-w-0">
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="responsive-page-header"
                >
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-semibold text-foreground font-display">Cash Flow</h1>
                        <p className="text-muted-foreground mt-1">Understand your financial health in real time</p>
                    </div>
                    <div className="responsive-page-header-actions gap-2">
                        <Button variant="outline" className="gap-2" onClick={() => setShowImportModal(true)}>
                          <Upload className="w-4 h-4" /> Import
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2">
                              <Download className="w-4 h-4" />
                              Export
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleExportExpenseCsv}>Export CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(createPageUrl(`CashFlowPDF?range=${timeRange}`), "_blank")}>
                              Export PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" className="gap-2" onClick={() => setShowReceiptScanner(true)}>
                          <ScanLine className="w-4 h-4" /> Scan Receipt
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingExpense(null);
                            setExpenseFormFromScan(false);
                            setShowExpenseForm(true);
                          }}
                          className="gap-2"
                        >
                          <Plus className="w-4 h-4" /> Add Expense
                        </Button>
                    </div>
                </motion.div>

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
                        {kpiModels.map((kpi) => {
                          const isNet = kpi.id === "net";
                          const iconMap = {
                            net: Wallet,
                            moneyIn: TrendingUp,
                            moneyOut: TrendingDown,
                            outstanding: DollarSign,
                          };
                          const toneValueClass = {
                            positive: "text-xl font-semibold text-emerald-600",
                            negative: "text-xl font-semibold text-red-600",
                            warning: "text-xl font-semibold text-orange-600",
                          };
                          const toneIconClass = {
                            positive: "text-emerald-600",
                            negative: "text-red-600",
                            warning: "text-orange-600",
                          };
                          return (
                            <CashFlowKpiCard
                              key={kpi.id}
                              title={kpi.title}
                              value={kpi.value}
                              currency={userCurrency}
                              icon={iconMap[kpi.id]}
                              iconClassName={toneIconClass[kpi.tone] || "text-muted-foreground"}
                              valueClassName={isNet ? "text-3xl font-semibold tracking-tight" : toneValueClass[kpi.tone]}
                              className={isNet ? "sm:col-span-2 border-primary/30" : undefined}
                              onClick={() => setKpiFilter(kpi.id)}
                              trendLabel={kpi.trendLabel}
                              trendIcon={kpi.trendDirection === "up" ? ArrowUpRight : kpi.trendDirection === "down" ? ArrowDownRight : undefined}
                              trendClassName={kpi.trendDirection === "up" ? "text-emerald-600" : "text-red-600"}
                            />
                          );
                        })}
                    </div>
                )}

                <CashPositionCard
                  currentBalance={cashPositionModel.currentBalance}
                  incomingProjection={cashPositionModel.incomingProjection}
                  outgoingProjection={cashPositionModel.outgoingProjection}
                  netProjection={cashPositionModel.netProjection}
                  currency={userCurrency}
                />

                <div className="flex gap-1 sm:gap-2 border-b border-border overflow-x-auto pb-px -mx-1 px-1 sm:mx-0 sm:px-0 touch-pan-x">
                    {['overview', 'transactions', 'insights'].map(tab => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`shrink-0 px-3 sm:px-4 py-2 font-medium transition-colors capitalize whitespace-nowrap ${
                                activeTab === tab 
                                    ? 'text-primary border-b-2 border-primary' 
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)] gap-6">
                    <CashFlowOverTimeChart
                      chartData={chartData}
                      userCurrency={userCurrency}
                      timeRange={timeRange}
                      onTimeRangeChange={setTimeRange}
                      quickFilter={quickFilter}
                      onQuickFilterChange={setQuickFilter}
                    />

                    <div className="space-y-4">
                      <UpcomingCashEventsPanel
                        events={upcomingCashEvents}
                        userCurrency={userCurrency}
                        onViewAllTransactions={() => setActiveTab("transactions")}
                      />
                      <InsightTiles insights={insights} />
                    </div>
                  </div>
                )}

                {activeTab === 'transactions' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <ExpenseFilters onFilterChange={setExpenseFilters} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={kpiFilter === "all" ? "default" : "outline"} onClick={() => setKpiFilter("all")} className="cursor-pointer">All</Badge>
                          <Badge variant={kpiFilter === "moneyIn" ? "default" : "outline"} onClick={() => setKpiFilter("moneyIn")} className="cursor-pointer">Money In</Badge>
                          <Badge variant={kpiFilter === "moneyOut" ? "default" : "outline"} onClick={() => setKpiFilter("moneyOut")} className="cursor-pointer">Money Out</Badge>
                          <Badge variant={kpiFilter === "outstanding" ? "default" : "outline"} onClick={() => setKpiFilter("outstanding")} className="cursor-pointer">Outstanding</Badge>
                        </div>

                        {filteredTransactions.length === 0 && payments.length === 0 && invoices.length === 0 ? (
                          <Card>
                            <CardContent className="py-16 text-center">
                              <CalendarClock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                              <p className="font-medium">No financial data yet</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Start by creating an invoice or adding an expense
                              </p>
                              <div className="flex gap-2 justify-center mt-4">
                                <Button onClick={() => window.location.href = createPageUrl("CreateInvoice")}>
                                  + Create Invoice
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setEditingExpense(null);
                                    setExpenseFormFromScan(false);
                                    setShowExpenseForm(true);
                                  }}
                                >
                                  + Add Expense
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ) : (
                          <ExpenseList
                            expenses={filteredTransactions}
                            isLoading={isLoading}
                            onEdit={handleEditExpense}
                            onDelete={handleDeleteExpense}
                            currency={userCurrency}
                            onActionSuccess={invalidateCashFlow}
                          />
                        )}
                    </motion.div>
                )}

                {activeTab === 'insights' && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        {/* Cash Flow Accuracy & Summary */}
                        <CashFlowAccuracy 
                            payments={payments}
                            expenses={storeExpenses || []}
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

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
                        <Card>
                            <CardHeader>
                                <CardTitle>Monthly Summary</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {chartData.slice(-3).reverse().map((month, idx) => (
                                        <div key={idx} className="p-4 bg-muted/30 rounded-lg">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-medium">{month.label}</span>
                                                <span className={`text-lg font-bold ${month.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {formatCurrency(month.net, userCurrency)}
                                                </span>
                                            </div>
                                            <div className="text-sm text-muted-foreground space-y-1">
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
                            <CardContent className="space-y-4 min-w-0">
                                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 min-w-0">
                                    <p className="text-sm text-muted-foreground">Average Monthly Income</p>
                                    <p className="text-2xl font-bold text-primary break-words">
                                        {formatCurrency(
                                          payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) / Math.max(chartData.length, 1),
                                          userCurrency
                                        )}
                                    </p>
                                </div>
                                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20 min-w-0">
                                    <p className="text-sm text-muted-foreground">Average Monthly Expenses</p>
                                    <p className="text-2xl font-bold text-red-600 break-words">
                                        {formatCurrency(
                                          (storeExpenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0) / Math.max(chartData.length, 1),
                                          userCurrency
                                        )}
                                    </p>
                                </div>
                                <div className={`p-4 rounded-lg border min-w-0 ${netCashFlow >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
                                    <p className="text-sm text-muted-foreground">Overall Balance</p>
                                    <p className={`text-2xl font-bold break-words ${netCashFlow >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                        {formatCurrency(netCashFlow, userCurrency)}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                        </div>
                    </motion.div>
                )}

                {showReceiptScanner && (
                    <ReceiptScanner
                        onScanComplete={handleScanComplete}
                        onCancel={() => setShowReceiptScanner(false)}
                    />
                )}

                {showImportModal && (
                    <BankImportModal
                        onImportComplete={() => {
                            setShowImportModal(false);
                            invalidateCashFlow();
                        }}
                        onCancel={() => setShowImportModal(false)}
                    />
                )}

                {showExpenseForm && (
                    <ExpenseForm
                        expense={editingExpense}
                        fromReceiptScan={expenseFormFromScan}
                        onSave={handleSaveExpense}
                        onCancel={() => {
                            setShowExpenseForm(false);
                            setEditingExpense(null);
                            setExpenseFormFromScan(false);
                        }}
                    />
                )}

            </div>
        </motion.div>
    );
}