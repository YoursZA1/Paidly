import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/currencyCalculations";
import { createPageUrl } from "@/utils";
import { listPosSales } from "@/services/PosIntegrationService";

export default function PosSalesCard({ currency = "ZAR" }) {
  const [loading, setLoading] = useState(true);
  const [totalToday, setTotalToday] = useState(0);
  const [sales, setSales] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listPosSales({ limit: 5, today: true });
        if (cancelled) return;
        setSales(result.sales);
        setTotalToday(result.totalToday);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Could not load POS sales");
          setSales([]);
          setTotalToday(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="dashboard-card px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">POS sales today</p>
        <div className="flex items-center gap-2">
          <Button size="sm" asChild className="dashboard-cta h-8 rounded-2xl px-3 text-xs">
            <Link to={createPageUrl("POS")}>Open POS</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="h-8 rounded-lg px-2 text-xs text-muted-foreground">
            <Link to={`${createPageUrl("Settings")}?tab=integrations`}>
              Manage
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      ) : (
        <>
          <p className="currency-nums mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {formatCurrency(totalToday, currency)}
          </p>
          {sales.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {sales.map((sale) => (
                <li key={sale.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">
                      {sale.payment_method || "POS"} · {sale.external_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sale.occurred_at ? format(new Date(sale.occurred_at), "HH:mm") : "—"}
                      {sale.inventory_applied ? " · stock updated" : ""}
                    </p>
                  </div>
                  <span className="currency-nums shrink-0 tabular-nums font-medium">
                    {formatCurrency(Number(sale.total_amount) || 0, sale.currency || currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No sales recorded today.</p>
          )}
        </>
      )}
    </section>
  );
}
