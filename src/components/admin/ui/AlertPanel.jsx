import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatAdminRelative, formatAdminZar } from "./adminFormat";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "./AdminStates";
import { cn } from "@/lib/utils";

export default function AlertPanel({ items = [], isLoading = false, errorMessage = null, onRetry }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Attention required</h2>
        <p className="text-xs text-muted-foreground">Only items that need an admin action.</p>
      </div>
      {isLoading ? <AdminLoadingState rows={3} className="p-4" /> : null}
      {errorMessage ? <AdminErrorState message={errorMessage} onRetry={onRetry} /> : null}
      {!isLoading && !errorMessage && !items.length ? (
        <AdminEmptyState title="Nothing needs attention" description="Failed payments, at-risk subscriptions, and suspended accounts will show up here." />
      ) : null}
      {!isLoading && !errorMessage && items.length ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.issue}</p>
                <p className="text-xs text-muted-foreground">
                  {item.entity}
                  {item.amount != null ? ` · ${formatAdminZar(item.amount)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    item.severity === "critical"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                  )}
                >
                  {item.severity === "critical" ? "Critical" : "Attention"}
                </span>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">{formatAdminRelative(item.date)}</span>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link to={item.href || "/admin-v2"}>{item.action || "Review"}</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
