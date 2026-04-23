import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/CurrencySelector";

export default function CashFlowKpiCard({
  title,
  value,
  currency = "ZAR",
  icon: Icon,
  iconClassName,
  valueClassName,
  onClick,
  trendLabel,
  trendIcon: TrendIcon,
  trendClassName,
  className,
}) {
  return (
    <Card className={cn(onClick ? "cursor-pointer" : "", className)} onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {Icon ? (
            <div className={cn("text-muted-foreground", iconClassName)}>
              <Icon className="w-5 h-5" />
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <p className={cn("text-xl font-semibold", valueClassName)}>{formatCurrency(value, currency)}</p>
        {trendLabel ? (
          <p className={cn("text-xs mt-2 flex items-center gap-1", trendClassName)}>
            {TrendIcon ? <TrendIcon className="w-3.5 h-3.5" /> : null}
            {trendLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
