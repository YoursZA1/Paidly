import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatCurrency } from "@/utils/currencyCalculations";
import { REVENUE_SERIES } from "@/lib/dashboard/revenueComposition";

function RevenueTooltip({ active, payload, label, userCurrency, showQuotes }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  const rows = [
    { key: "invoices", label: REVENUE_SERIES.invoices.label, value: point.invoices },
    { key: "pos", label: REVENUE_SERIES.pos.label, value: point.pos },
    { key: "other", label: REVENUE_SERIES.other.label, value: point.other },
  ];
  if (showQuotes) {
    rows.push({ key: "quotes", label: "Potential quotes", value: point.quotes });
  }
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <p className="mb-1.5 font-medium text-foreground">{point.dateLabel || label}</p>
      <dl className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="currency-nums tabular-nums text-foreground">
              {formatCurrency(Number(row.value) || 0, userCurrency)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1">
          <dt className="font-medium text-foreground">Total</dt>
          <dd className="currency-nums font-medium tabular-nums text-foreground">
            {formatCurrency(Number(point.total) || 0, userCurrency)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function DashboardRevenueChart({
  chart = [],
  userCurrency,
  showQuotes = false,
  onChartClick,
  compact = false,
}) {
  return (
    <div
      className={`${compact ? "h-full min-h-[112px] w-full" : "h-[220px] w-full sm:h-[240px]"} ${onChartClick ? "cursor-pointer" : ""}`}
      onClick={onChartClick || undefined}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={4}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip
            content={<RevenueTooltip userCurrency={userCurrency} showQuotes={showQuotes} />}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="invoices"
            name={REVENUE_SERIES.invoices.label}
            stroke={REVENUE_SERIES.invoices.color}
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, fill: REVENUE_SERIES.invoices.color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="pos"
            name={REVENUE_SERIES.pos.label}
            stroke={REVENUE_SERIES.pos.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: REVENUE_SERIES.pos.color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="other"
            name={REVENUE_SERIES.other.label}
            stroke={REVENUE_SERIES.other.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: REVENUE_SERIES.other.color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          {showQuotes ? (
            <Line
              type="monotone"
              dataKey="quotes"
              name={REVENUE_SERIES.quotes.label}
              stroke={REVENUE_SERIES.quotes.color}
              strokeWidth={1.25}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3, fill: REVENUE_SERIES.quotes.color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
