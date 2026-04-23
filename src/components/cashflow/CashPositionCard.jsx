import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/CurrencySelector";
import { cn } from "@/lib/utils";

export default function CashPositionCard({
  currentBalance,
  incomingProjection,
  outgoingProjection,
  netProjection,
  currency = "ZAR",
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Position</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Current Balance</p>
          <p className="text-lg font-semibold">{formatCurrency(currentBalance, currency)}</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-3">
          <p className="text-xs text-muted-foreground">Incoming (30D)</p>
          <p className="text-lg font-semibold text-emerald-700">{formatCurrency(incomingProjection, currency)}</p>
        </div>
        <div className="rounded-lg bg-red-500/10 p-3">
          <p className="text-xs text-muted-foreground">Outgoing (30D)</p>
          <p className="text-lg font-semibold text-red-700">{formatCurrency(outgoingProjection, currency)}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">Net Projection</p>
          <p className={cn("text-lg font-semibold", netProjection >= 0 ? "text-emerald-700" : "text-red-700")}>
            {formatCurrency(netProjection, currency)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
