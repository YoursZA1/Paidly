import {
  TrendingUp,
  CalendarRange,
  CalendarDays,
  CircleDollarSign,
  XCircle,
  Undo2,
  UserRound,
} from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

const ICONS = {
  mrr: TrendingUp,
  arr: CalendarRange,
  todaysRevenue: CalendarDays,
  monthlyRevenue: CircleDollarSign,
  failedRevenue: XCircle,
  refunds: Undo2,
  averageRevenuePerUser: UserRound,
};

function formatZar(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "R 0";
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Admin Dashboard — Revenue metrics (server-computed).
 */
export default function RevenueOverview({
  metrics,
  isLoading = false,
  errorMessage = null,
  className = "",
}) {
  const cards = metrics?.metrics || [
    { key: "mrr", label: "MRR", amount: metrics?.mrr ?? 0 },
    { key: "arr", label: "ARR", amount: metrics?.arr ?? 0 },
    { key: "todaysRevenue", label: "Today's Revenue", amount: metrics?.todaysRevenue ?? 0 },
    { key: "monthlyRevenue", label: "Monthly Revenue", amount: metrics?.monthlyRevenue ?? 0 },
    { key: "failedRevenue", label: "Failed Revenue", amount: metrics?.failedRevenue ?? 0 },
    { key: "refunds", label: "Refunds", amount: metrics?.refunds ?? 0 },
    {
      key: "averageRevenuePerUser",
      label: "Average Revenue Per User",
      amount: metrics?.averageRevenuePerUser ?? 0,
    },
  ];

  return (
    <section className={className}>
      <div className="mb-3">
        <h2 className="font-semibold text-foreground">Revenue</h2>
        <p className="text-xs text-muted-foreground">
          MRR/ARR from active subscriptions · cash, failed, and refunds from payment history (UTC month)
          {metrics?.payingUserCount != null ? (
            <>
              {" · "}
              <span className="tabular-nums">{metrics.payingUserCount} paying</span>
            </>
          ) : null}
        </p>
      </div>

      {errorMessage ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {cards.map((c) => (
          <StatCard
            key={c.key}
            title={c.label}
            value={isLoading && metrics == null ? "—" : formatZar(c.amount)}
            icon={ICONS[c.key] || CircleDollarSign}
          />
        ))}
      </div>
    </section>
  );
}
