import { addDays, isAfter, isBefore, parseISO } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";

export function buildCashFlowKpis({
  netCashFlow,
  netTrendPct,
  monthlyIncome,
  monthlyExpenses,
  outstandingInvoices,
}) {
  return [
    {
      id: "net",
      title: "Net Cash Flow",
      value: netCashFlow,
      trendLabel: `${Math.abs(netTrendPct).toFixed(0)}% vs last month`,
      trendDirection: netTrendPct >= 0 ? "up" : "down",
      tone: netCashFlow >= 0 ? "positive" : "negative",
      featured: true,
    },
    {
      id: "moneyIn",
      title: "Money In (This Month)",
      value: monthlyIncome,
      tone: "positive",
    },
    {
      id: "moneyOut",
      title: "Money Out (This Month)",
      value: monthlyExpenses,
      tone: "negative",
    },
    {
      id: "outstanding",
      title: "Outstanding",
      value: outstandingInvoices,
      tone: "warning",
    },
  ];
}

export function buildCashPositionModel({
  currentBalance,
  incomingProjection,
  outgoingProjection,
  netProjection,
}) {
  return {
    currentBalance,
    incomingProjection,
    outgoingProjection,
    netProjection,
  };
}

export function buildUpcomingCashEvents({ invoices = [], expenses = [], now = new Date(), windowDays = 30 }) {
  const end = addDays(now, windowDays);
  const inEvents = invoices
    .filter((inv) => {
      const raw = inv.due_date || inv.delivery_date;
      if (!raw) return false;
      const dt = parseISO(raw);
      return isAfter(dt, now) && isBefore(dt, end) && String(inv.status || "").toLowerCase() !== "paid";
    })
    .map((inv) => ({
      id: `in-${inv.id}`,
      type: "income",
      name: inv.client_name || `Invoice #${inv.invoice_number || inv.id}`,
      date: inv.due_date || inv.delivery_date,
      amount: Number(inv.total_amount ?? inv.grand_total ?? 0) || 0,
    }));

  const outEvents = expenses
    .filter((exp) => exp.date && isAfter(parseISO(exp.date), now) && isBefore(parseISO(exp.date), end))
    .map((exp) => ({
      id: `out-${exp.id}`,
      type: "expense",
      name: exp.description || exp.category || "Expense",
      date: exp.date,
      amount: Number(exp.amount) || 0,
    }));

  return [...inEvents, ...outEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function buildCashFlowInsights({
  monthlyExpenses,
  prevExpenses,
  outstandingInvoices,
  netCashFlow,
  prevNet,
  quickFilter,
  userCurrency = "ZAR",
}) {
  const expTrend = prevExpenses === 0 ? 0 : ((monthlyExpenses - prevExpenses) / Math.abs(prevExpenses)) * 100;
  return [
    {
      id: "exp-trend",
      tone: expTrend > 0 ? "orange" : "green",
      text: `Your expenses ${expTrend > 0 ? "increased" : "decreased"} by ${Math.abs(expTrend).toFixed(0)}% ${quickFilter === "lastMonth" ? "vs prior month" : "this month"}.`,
    },
    {
      id: "outstanding",
      tone: outstandingInvoices > 0 ? "orange" : "green",
      text: `You have ${formatCurrency(outstandingInvoices, userCurrency, 0)} in unpaid invoices.`,
    },
    {
      id: "trend",
      tone: netCashFlow >= prevNet ? "green" : "red",
      text: `Cash flow is ${netCashFlow >= prevNet ? "trending upward" : "under pressure"} compared with last month.`,
    },
  ];
}
