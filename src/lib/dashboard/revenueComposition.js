import {
  addDays,
  addMonths,
  endOfMonth,
  format as formatDate,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { collectIncomeEvents } from "@/utils/cashFlowTruth";
import { isPosOriginInvoice } from "@/logic/invoiceLogic";
import { QUOTE_STATUS, normalizeQuoteStatus } from "@shared/commercial/documentStatuses.js";
import { buildTrend } from "@/lib/dashboard/financialSummary";

const POTENTIAL_QUOTE_STATUSES = new Set([
  QUOTE_STATUS.sent,
  QUOTE_STATUS.viewed,
  QUOTE_STATUS.accepted,
]);

export const REVENUE_SERIES = Object.freeze({
  invoices: { key: "invoices", label: "Invoices", color: "#f24e00" },
  pos: { key: "pos", label: "POS", color: "#334155" },
  other: { key: "other", label: "Other", color: "#94a3b8" },
  quotes: { key: "quotes", label: "Potential quotes", color: "#78716c" },
});

/** Calendar windows for the dashboard revenue hero (not the rolling 30/60/90 widget). */
export const REVENUE_HERO_PERIOD = Object.freeze({
  month: "month",
  year: "year",
});

export function money2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function eventDate(raw) {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function quoteOccurredAt(quote) {
  return quote?.sent_date || quote?.created_date || quote?.created_at || null;
}

function quoteAmount(quote) {
  return money2(quote?.total_amount || quote?.total || 0);
}

function isPotentialQuote(quote) {
  return POTENTIAL_QUOTE_STATUSES.has(normalizeQuoteStatus(quote?.status));
}

function windowBounds(rangeDays, now) {
  const days = Math.max(1, Number(rangeDays) || 30);
  const end = startOfDay(now);
  const start = startOfDay(subDays(end, days - 1));
  const previousEnd = startOfDay(subDays(start, 1));
  const previousStart = startOfDay(subDays(previousEnd, days - 1));
  return { days, start, end, previousStart, previousEnd };
}

function inWindow(date, start, end) {
  if (!date) return false;
  const d = startOfDay(date);
  return d >= start && d <= end;
}

function dayKey(date) {
  return formatDate(startOfDay(date), "yyyy-MM-dd");
}

function emptyBuckets(start, days) {
  const buckets = [];
  for (let i = 0; i < days; i += 1) {
    const d = startOfDay(new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
    buckets.push({
      date: d,
      key: dayKey(d),
      label: formatDate(d, "MMM d"),
      invoices: 0,
      pos: 0,
      other: 0,
      quotes: 0,
    });
  }
  return buckets;
}

function emptyDayBuckets(start, end) {
  const buckets = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor <= last) {
    buckets.push({
      date: cursor,
      key: dayKey(cursor),
      label: formatDate(cursor, "d"),
      invoices: 0,
      pos: 0,
      other: 0,
      quotes: 0,
    });
    cursor = addDays(cursor, 1);
  }
  return buckets;
}

function monthKey(date) {
  return formatDate(startOfMonth(date), "yyyy-MM");
}

function emptyMonthBuckets(start, end) {
  const buckets = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    buckets.push({
      date: cursor,
      key: monthKey(cursor),
      label: formatDate(cursor, "MMM"),
      invoices: 0,
      pos: 0,
      other: 0,
      quotes: 0,
    });
    cursor = addMonths(cursor, 1);
  }
  return buckets;
}

function resolveBounds({ period, rangeDays, now }) {
  if (period === REVENUE_HERO_PERIOD.year) {
    const end = startOfDay(now);
    return {
      start: startOfYear(now),
      end,
      previousStart: startOfYear(subYears(now, 1)),
      previousEnd: startOfDay(subYears(end, 1)),
      grain: "month",
      comparisonLabel: "last year",
      rangeDays: null,
      period: REVENUE_HERO_PERIOD.year,
    };
  }
  if (period === REVENUE_HERO_PERIOD.month) {
    const end = startOfDay(now);
    const start = startOfMonth(now);
    const previousStart = startOfMonth(subMonths(now, 1));
    const previousEnd = startOfDay(
      new Date(
        previousStart.getFullYear(),
        previousStart.getMonth(),
        Math.min(end.getDate(), endOfMonth(previousStart).getDate())
      )
    );
    return {
      start,
      end,
      previousStart,
      previousEnd,
      grain: "day",
      comparisonLabel: "last month",
      rangeDays: null,
      period: REVENUE_HERO_PERIOD.month,
    };
  }
  const rolling = windowBounds(rangeDays, now);
  return {
    ...rolling,
    grain: "day",
    comparisonLabel: `previous ${rolling.days} days`,
    period: null,
    rangeDays: rolling.days,
  };
}

function chartBucketsForBounds(bounds) {
  if (bounds.grain === "month") return emptyMonthBuckets(bounds.start, bounds.end);
  if (bounds.period === REVENUE_HERO_PERIOD.month) return emptyDayBuckets(bounds.start, bounds.end);
  return emptyBuckets(bounds.start, bounds.days);
}

function bucketKeyForRow(rowDate, grain) {
  return grain === "month" ? monthKey(rowDate) : dayKey(rowDate);
}

function tagPosOriginInvoices(invoices = [], posSales = []) {
  const posInvoiceIds = new Set(
    (Array.isArray(posSales) ? posSales : []).map((row) => row?.invoice_id).filter(Boolean)
  );
  return (Array.isArray(invoices) ? invoices : []).map((invoice) => {
    if (isPosOriginInvoice(invoice) || (invoice?.id && posInvoiceIds.has(invoice.id))) {
      return { ...invoice, pos_sale_event_id: invoice.pos_sale_event_id || "pos" };
    }
    return invoice;
  });
}

function classifyIncomeEvents(events = []) {
  const dated = [];
  for (const event of events) {
    const amount = money2(event?.amount);
    if (amount === 0) continue;
    const date = eventDate(event.date);
    let source = "other";
    if (event.channel === "pos") source = "pos";
    else if (event.invoiceId) source = "invoices";
    dated.push({ date, amount, source });
  }
  return dated;
}

function sumSource(dated, source, start, end) {
  return money2(
    dated.reduce((sum, row) => {
      if (row.source !== source) return sum;
      if (!inWindow(row.date, start, end)) return sum;
      return sum + row.amount;
    }, 0)
  );
}

function percentOf(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * Realized revenue = invoices + POS + other. Quotes are potential only.
 * Pass `period: "month" | "year"` for the dashboard hero (calendar windows).
 * Omit `period` and use `rangeDays` for the rolling 30/60/90 widget.
 */
export function computeDashboardRevenue({
  invoices = [],
  payments = [],
  posSales = [],
  quotes = [],
  rangeDays = 30,
  period = null,
  now = new Date(),
} = {}) {
  const bounds = resolveBounds({ period, rangeDays, now });
  const taggedInvoices = tagPosOriginInvoices(invoices, posSales);
  const dated = classifyIncomeEvents(collectIncomeEvents(payments, taggedInvoices, posSales));

  const invoicesCurrent = sumSource(dated, "invoices", bounds.start, bounds.end);
  const posCurrent = sumSource(dated, "pos", bounds.start, bounds.end);
  const otherCurrent = sumSource(dated, "other", bounds.start, bounds.end);
  const realized = money2(invoicesCurrent + posCurrent + otherCurrent);

  const invoicesPrevious = sumSource(dated, "invoices", bounds.previousStart, bounds.previousEnd);
  const posPrevious = sumSource(dated, "pos", bounds.previousStart, bounds.previousEnd);
  const otherPrevious = sumSource(dated, "other", bounds.previousStart, bounds.previousEnd);
  const realizedPrevious = money2(invoicesPrevious + posPrevious + otherPrevious);

  const potentialQuotes = (Array.isArray(quotes) ? quotes : []).filter(isPotentialQuote);
  const quotesCurrent = money2(
    potentialQuotes.reduce((sum, quote) => {
      const date = eventDate(quoteOccurredAt(quote));
      if (!inWindow(date, bounds.start, bounds.end)) return sum;
      return sum + quoteAmount(quote);
    }, 0)
  );

  const buckets = chartBucketsForBounds(bounds);
  const byKey = new Map(buckets.map((row) => [row.key, row]));

  for (const row of dated) {
    if (!inWindow(row.date, bounds.start, bounds.end)) continue;
    const bucket = byKey.get(bucketKeyForRow(row.date, bounds.grain));
    if (!bucket) continue;
    bucket[row.source] = money2(bucket[row.source] + row.amount);
  }
  for (const quote of potentialQuotes) {
    const date = eventDate(quoteOccurredAt(quote));
    if (!inWindow(date, bounds.start, bounds.end)) continue;
    const bucket = byKey.get(bucketKeyForRow(date, bounds.grain));
    if (!bucket) continue;
    bucket.quotes = money2(bucket.quotes + quoteAmount(quote));
  }

  const chart = buckets.map((row) => ({
    label: row.label,
    dateLabel:
      bounds.grain === "month" ? formatDate(row.date, "MMMM yyyy") : formatDate(row.date, "d MMM yyyy"),
    invoices: row.invoices,
    pos: row.pos,
    other: row.other,
    quotes: row.quotes,
    total: money2(row.invoices + row.pos + row.other),
  }));

  const hasRealizedPoints = chart.some((row) => row.total !== 0);
  const hasQuotePoints = chart.some((row) => row.quotes !== 0);

  const trend = buildTrend({
    current: realized,
    previous: realizedPrevious,
    periodLabel: bounds.comparisonLabel,
  });

  const sources = [
    {
      key: "invoices",
      label: "Invoices",
      amount: invoicesCurrent,
      percent: percentOf(invoicesCurrent, realized),
      realized: true,
    },
    {
      key: "pos",
      label: "POS",
      amount: posCurrent,
      percent: percentOf(posCurrent, realized),
      realized: true,
    },
    {
      key: "other",
      label: "Other",
      amount: otherCurrent,
      percent: percentOf(otherCurrent, realized),
      realized: true,
    },
  ];

  return {
    rangeDays: bounds.rangeDays ?? bounds.days ?? rangeDays,
    period: bounds.period,
    comparisonLabel: bounds.comparisonLabel,
    realized,
    realizedPrevious,
    invoices: invoicesCurrent,
    pos: posCurrent,
    other: otherCurrent,
    quotes: quotesCurrent,
    pipeline: money2(realized + quotesCurrent),
    trend,
    chart,
    sources,
    hasRealizedPoints,
    hasQuotePoints,
    empty: realized === 0 && quotesCurrent === 0,
  };
}
