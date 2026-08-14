import {
  CheckCircle2,
  Clock,
  Ban,
  CalendarX2,
  Hourglass,
  AlertTriangle,
} from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import { Link } from "react-router-dom";

const ICONS = {
  active: CheckCircle2,
  pending: Hourglass,
  expired: CalendarX2,
  cancelled: Ban,
  trial: Clock,
  pastDue: AlertTriangle,
};

/**
 * Admin Dashboard — Subscription Overview (backend counts only).
 */
export default function SubscriptionOverview({
  overview,
  isLoading = false,
  errorMessage = null,
  className = "",
  showManageLink = true,
}) {
  const buckets = overview?.buckets || [
    { key: "active", label: "Active", count: overview?.active ?? 0 },
    { key: "pending", label: "Pending", count: overview?.pending ?? 0 },
    { key: "expired", label: "Expired", count: overview?.expired ?? 0 },
    { key: "cancelled", label: "Cancelled", count: overview?.cancelled ?? 0 },
    { key: "trial", label: "Trial", count: overview?.trial ?? 0 },
    { key: "pastDue", label: "Past Due", count: overview?.pastDue ?? 0 },
  ];

  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">Subscription overview</h2>
          <p className="text-xs text-muted-foreground">
            Live counts from subscription status (server).{" "}
            {overview?.total != null ? (
              <span className="tabular-nums">{overview.total} total rows</span>
            ) : null}
          </p>
        </div>
        {showManageLink ? (
          <Link
            to="/admin-v2/subscriptions"
            className="text-xs font-medium text-primary hover:underline"
          >
            Manage subscriptions →
          </Link>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mb-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {buckets.map((b) => (
          <StatCard
            key={b.key}
            title={b.label}
            value={isLoading && overview == null ? "—" : b.count}
            icon={ICONS[b.key] || CheckCircle2}
          />
        ))}
      </div>
    </section>
  );
}
