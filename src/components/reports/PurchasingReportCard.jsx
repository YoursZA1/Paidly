import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/currencyCalculations";
import { createPageUrl } from "@/utils";

function Metric({ label, value, hint, tone = "" }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{hint}</p> : null}
    </div>
  );
}

/**
 * Purchasing in four separate figures — never added together:
 *   committed spend (approved, not received) · supplier payables (received, unpaid)
 *   upcoming supplier payments (due in 30 days) · paid supplier spend (recorded payments this month).
 * Only the last is an expense; it is already inside the expense totals above.
 */
export default function PurchasingReportCard({ summary, paidThisMonth = 0, currency = "ZAR" }) {
  const money = (v) => formatCurrency(v, currency);
  return (
    <Card className="rounded-xl border border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">Purchasing</CardTitle>
          <Link to={createPageUrl("PurchaseOrders")} className="text-sm font-medium text-primary hover:underline">
            Purchase orders
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Commitments and payables are not expenses. Only paid supplier spend is counted in expenses and cash out.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric label="Committed purchase spend" value={money(summary.committedOpen)} hint="Approved orders not yet received" />
        <Metric
          label="Outstanding supplier payables"
          value={money(summary.payableNow)}
          hint="Goods received, not yet paid"
          tone={summary.payableNow > 0 ? "text-amber-700 dark:text-amber-400" : ""}
        />
        <Metric
          label="Upcoming supplier payments"
          value={money(summary.dueNext30)}
          hint={summary.overdue > 0 ? `Due within 30 days · ${money(summary.overdue)} overdue` : "Due within 30 days"}
          tone={summary.overdue > 0 ? "text-red-700 dark:text-red-400" : ""}
        />
        <Metric label="Paid supplier spend" value={money(paidThisMonth)} hint="Supplier payments recorded this month" tone="text-emerald-700 dark:text-emerald-400" />
      </CardContent>
    </Card>
  );
}
