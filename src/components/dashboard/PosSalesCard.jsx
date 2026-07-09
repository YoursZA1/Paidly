import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Plug, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (!loading && !error && sales.length === 0 && totalToday === 0) {
    return null;
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          POS sales today
        </CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
          <Link to={`${createPageUrl("Settings")}?tab=integrations`}>
            Manage
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <>
            <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalToday, currency)}</p>
            {sales.length > 0 ? (
              <ul className="space-y-2">
                {sales.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between text-sm gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-foreground">
                        {sale.payment_method || "POS"} · {sale.external_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sale.occurred_at ? format(new Date(sale.occurred_at), "HH:mm") : "—"}
                        {sale.inventory_applied ? " · stock updated" : ""}
                      </p>
                    </div>
                    <span className="font-medium shrink-0">
                      {formatCurrency(Number(sale.total_amount) || 0, sale.currency || currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No POS sales recorded today yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
