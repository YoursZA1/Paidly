import { Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/currencyCalculations";

function Metric({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function PosSalesReportCard({
  title = "POS sales",
  subtitle,
  summary,
  currency = "ZAR",
  loading = false,
}) {
  if (loading) return null;
  if (!summary) return null;

  return (
    <Card className="rounded-xl border border-border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Metric label="Today's sales" value={formatCurrency(summary.today_sales ?? summary.net_sales, currency)} />
            <Metric label="POS sales" value={formatCurrency(summary.pos_sales, currency)} />
            <Metric label="Cash sales" value={formatCurrency(summary.cash_sales, currency)} />
            <Metric label="Digital sales" value={formatCurrency(summary.digital_sales, currency)} />
            {summary.card_sales > 0 ? (
              <Metric label="Card sales" value={formatCurrency(summary.card_sales, currency)} />
            ) : null}
            <Metric label="Refunds" value={formatCurrency(summary.refunds, currency)} />
          </div>
          <div className="space-y-1.5">
            <Metric label="Gross sales" value={formatCurrency(summary.gross_sales, currency)} />
            <Metric label="Discounts" value={formatCurrency(summary.discounts, currency)} />
            <Metric label="Tax" value={formatCurrency(summary.tax, currency)} />
            <Metric label="Net sales" value={formatCurrency(summary.net_sales, currency)} />
            <Metric label="Units sold" value={String(summary.units_sold ?? 0)} />
          </div>
        </div>
        {Array.isArray(summary.top_products) && summary.top_products.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Top products</p>
            <ul className="space-y-1">
              {summary.top_products.map((product) => (
                <li key={product.product_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{product.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {product.units} · {formatCurrency(product.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No till sales in this period.</p>
        )}
      </CardContent>
    </Card>
  );
}
