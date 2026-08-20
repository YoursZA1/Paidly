import {
  CheckCircle2,
  Clock,
  Ban,
  CalendarX2,
  Hourglass,
  AlertTriangle,
  CircleDollarSign,
  Users,
  Wallet,
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
  failed: Ban,
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
 * Admin Dashboard — Subscription Overview (backend counts only).
 */
export default function SubscriptionOverview({
  overview,
  reporting = null,
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

  const showReporting = reporting && typeof reporting === "object";

  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">Billing &amp; subscriptions</h2>
          <p className="text-xs text-muted-foreground">
            Live counts from the server. Revenue counts verified PayFast payments from 20 Aug 2026 (UTC).{" "}
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

      {showReporting ? (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Successful Payments"
            value={isLoading ? "—" : reporting.successfulPayments ?? 0}
            icon={Wallet}
          />
          <StatCard
            title="Revenue"
            value={isLoading ? "—" : formatZar(reporting.revenue)}
            icon={CircleDollarSign}
          />
          <StatCard
            title="Active Subscribers"
            value={isLoading ? "—" : reporting.activeSubscribers ?? 0}
            icon={Users}
          />
          <StatCard
            title="Trial Users"
            value={isLoading ? "—" : reporting.trialUsers ?? 0}
            icon={Clock}
          />
          <StatCard
            title="Expired Trials"
            value={isLoading ? "—" : reporting.expiredTrials ?? 0}
            icon={CalendarX2}
          />
        </div>
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
