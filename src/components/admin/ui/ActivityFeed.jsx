import { Link } from "react-router-dom";
import { formatAdminRelative } from "./adminFormat";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "./AdminStates";

export default function ActivityFeed({
  items = [],
  isLoading = false,
  errorMessage = null,
  onRetry,
  viewAllTo = "/admin-v2/activity",
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <Link to={viewAllTo} className="text-xs font-medium text-primary hover:underline">
          View all activity →
        </Link>
      </div>
      <div className="p-2">
        {isLoading ? <AdminLoadingState rows={3} className="p-3" /> : null}
        {errorMessage ? <AdminErrorState message={errorMessage} onRetry={onRetry} /> : null}
        {!isLoading && !errorMessage && !items.length ? (
          <AdminEmptyState title="No recent platform events" description="New businesses, payments, and admin actions will appear here." />
        ) : null}
        {!isLoading && !errorMessage
          ? items.map((item) => (
              <Link
                key={item.id}
                to={item.href || viewAllTo}
                className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.event}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.entity}</p>
                </div>
                <p className="shrink-0 text-[11px] text-muted-foreground">{formatAdminRelative(item.date)}</p>
              </Link>
            ))
          : null}
      </div>
    </section>
  );
}
