import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/CurrencySelector";
import { format, parseISO } from "date-fns";

export default function UpcomingCashEventsPanel({
  events,
  userCurrency = "ZAR",
  onViewAllTransactions,
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upcoming Cash Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[320px] overflow-auto">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming cash events.</p>
        ) : (
          events.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <Badge
                  className={
                    item.type === "income"
                      ? "bg-emerald-500/10 text-emerald-700 border-transparent"
                      : "bg-red-500/10 text-red-700 border-transparent"
                  }
                >
                  {item.type}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>{format(parseISO(item.date), "MMM d, yyyy")}</span>
                <span className="font-medium text-foreground">{formatCurrency(item.amount, userCurrency)}</span>
              </div>
            </div>
          ))
        )}
        <Button variant="link" className="px-0" onClick={onViewAllTransactions}>
          View all transactions
        </Button>
      </CardContent>
    </Card>
  );
}
