import { useState } from "react";
import MetricCard from "@/components/admin/ui/MetricCard";
import { formatAdminZar } from "@/components/admin/ui/adminFormat";
import { fetchAdminDirectory } from "@/api/fetchAdminDirectory";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "This month" },
  { id: "previousMonth", label: "Previous month" },
  { id: "all", label: "All" },
];

function formatVolume(volume) {
  if (!Array.isArray(volume) || volume.length === 0) return "—";
  return volume
    .map((row) => (row.currency === "ZAR" ? formatAdminZar(row.amount) : `${row.currency} ${row.amount}`))
    .join(" · ");
}

function zarAmount(volume) {
  const row = (volume || []).find((item) => item.currency === "ZAR");
  return row ? row.amount : null;
}

function MixList({ title, hint, rows, showAmounts }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <ul className="mt-3 divide-y divide-border">
        {(rows || []).map((row) => (
          <li key={row.key} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(row.count || 0).toLocaleString("en-ZA")} transactions
                  {row.share != null ? ` · ${row.share}%` : ""}
                  {row.successRate != null ? ` · ${row.successRate}% success` : ""}
                </p>
              </div>
              {showAmounts ? (
                <span className="text-sm font-medium text-foreground">{formatVolume(row.volume)}</span>
              ) : null}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Number(row.share) || 0)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrendChart({ trend, showAmounts }) {
  const max = Math.max(...(trend || []).map((day) => day.count), 1);
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Transactions over 30 days</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Platform totals for each day. A bar is a count, not a business.</p>
      <div className="mt-4 flex h-28 items-end gap-1">
        {(trend || []).map((day) => (
          <div key={day.date} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-sm bg-primary/80"
              style={{ height: `${Math.max(4, Math.round((day.count / max) * 100))}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">
              {day.date}: {day.count.toLocaleString("en-ZA")} intents
              {showAmounts ? ` · ${formatVolume(day.volume)}` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditLookup() {
  const [intentId, setIntentId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [audit, setAudit] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setAudit(null);
    try {
      const result = await fetchAdminDirectory("payment-intent-audit", 1, {
        intentId: intentId.trim(),
        reason: reason.trim(),
      });
      setAudit(result?.audit || null);
    } catch (err) {
      setError(err?.message || "Could not open that investigation");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Audit / support investigation</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Platform admins only. Opening a payment records who looked, when, and why. This is not the finance dashboard.
      </p>
      <form onSubmit={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          value={intentId}
          onChange={(event) => setIntentId(event.target.value)}
          placeholder="Payment intent id"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why this is being investigated"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          autoComplete="off"
        />
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          {pending ? "Opening…" : "Look up"}
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {audit ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Business</dt><dd>{audit.business || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{audit.status || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Amount</dt><dd>{formatAdminZar(audit.amount)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Method</dt><dd>{audit.method || audit.provider || "—"}</dd></div>
        </dl>
      ) : null}
    </section>
  );
}

export default function AdminPaymentFinance({ data, isLoading, isError, error, range, onRangeChange }) {
  const [period, setPeriod] = useState("30d");
  const [draftFrom, setDraftFrom] = useState(range?.from || "");
  const [draftTo, setDraftTo] = useState(range?.to || "");
  const finance = data?.finance;
  const activePeriod = finance?.periods?.custom && range?.from && range?.to ? "custom" : period;
  const snapshot = finance?.periods?.[activePeriod] || null;
  const showAmounts = finance?.amountsVisible === true;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading payment activity…</p>;
  if (isError) return <p className="text-sm text-destructive">{error?.message || "Could not load payment activity."}</p>;
  if (data?.unavailable) return <p className="text-sm text-muted-foreground">{data.unavailableReason || "Payment activity is not available."}</p>;
  if (!snapshot) return <p className="text-sm text-muted-foreground">Payment activity is not available.</p>;

  const invoices = finance.invoiceDocuments;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setPeriod(item.id);
              onRangeChange?.({ from: "", to: "" });
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activePeriod === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRangeChange?.({ from: draftFrom, to: draftTo });
          }}
        >
          <input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs" />
          <input type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs" />
          <button type="submit" className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Apply range</button>
        </form>
      </div>
      {finance?.truncated ? (
        <p className="text-xs text-muted-foreground">Totals cover the latest 20,000 payment intents.</p>
      ) : null}
      {finance?.aggregatedInDatabase ? (
        <p className="text-xs text-muted-foreground">Totals are calculated in the database.</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Payment intents" value={snapshot.total} />
        <MetricCard title="Successful" value={snapshot.successful} />
        <MetricCard title="Failed" value={snapshot.failed} />
        <MetricCard title="Pending" value={snapshot.pending} />
        <MetricCard title="Success rate" value={snapshot.successRate} footnote="Percent of intents in this period" />
        <MetricCard title="Failed rate" value={snapshot.failedRate} footnote="Percent of intents in this period" />
        {showAmounts ? (
          <>
            <MetricCard title="Processed" value={zarAmount(snapshot.volume)} isMoney hint="Successful payment volume in this period." />
            <MetricCard title="Average value" value={zarAmount(snapshot.averageValue)} isMoney hint="Successful volume divided by successful intents." />
          </>
        ) : (
          <MetricCard title="Processed" unavailable unavailableReason="Visible to platform admins only." />
        )}
      </div>
      <TrendChart trend={finance.trend} showAmounts={showAmounts} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MixList
          title="Payment methods"
          hint="How customers paid. Counts are all intents. Amounts are successful volume."
          rows={snapshot.methods}
          showAmounts={showAmounts}
        />
        <MixList
          title="Where it started"
          hint="POS, invoice, quote, and recurring payment intents."
          rows={snapshot.products}
          showAmounts={showAmounts}
        />
        <MixList
          title="POS performance"
          hint="Till payments only."
          rows={snapshot.pos?.methods}
          showAmounts={showAmounts}
        />
        <MixList
          title="Payment providers"
          hint="Registered rails, counted across the platform."
          rows={snapshot.providers}
          showAmounts={showAmounts}
        />
      </div>
      <section className="rounded-2xl border border-border/80 bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Invoice performance</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Platform counts. No invoice number and no business.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Invoices generated" value={invoices?.generated} />
          <MetricCard title="Invoices paid" value={invoices?.paid} />
          <MetricCard title="Payment rate" value={invoices?.paymentRate} footnote="Paid or partially paid" />
          {showAmounts ? (
            <>
              <MetricCard title="Invoice totals paid" value={invoices?.paidVolume} isMoney />
              <MetricCard title="Outstanding" value={invoices?.outstandingVolume} isMoney />
            </>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Quotes created: {finance.quoteCount == null ? "—" : Number(finance.quoteCount).toLocaleString("en-ZA")}.
          Recurring schedules: {finance.recurringCount == null ? "—" : Number(finance.recurringCount).toLocaleString("en-ZA")}.
        </p>
      </section>
      <p className="text-xs text-muted-foreground">
        This view answers whether Paidly’s payment system is working. It does not show what a business earned.
        {snapshot.otherStatus ? ` ${Number(snapshot.otherStatus).toLocaleString("en-ZA")} cancelled, expired, or refunded intents are included in the total.` : ""}
      </p>
      {finance.canAudit ? <AuditLookup /> : null}
    </div>
  );
}
