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
  featured = false,
  active = false,
  className,
}) {
  return (
    <Card
      className={cn(
        "h-full flex flex-col",
        onClick && "cursor-pointer transition-shadow hover:shadow-md",
        featured && "border-primary/25 bg-gradient-to-br from-card via-card to-muted/30",
        active && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground leading-tight">{title}</CardTitle>
          {Icon ? (
            <div className={cn("shrink-0", iconClassName)}>
              <Icon className="w-5 h-5" aria-hidden />
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end pt-0">
        <p
          className={cn(
            featured ? "text-2xl sm:text-[1.75rem] font-semibold tracking-tight" : "text-xl font-semibold",
            valueClassName
          )}
        >
          {formatCurrency(value, currency)}
        </p>
        <p
          className={cn(
            "mt-2 min-h-[1.125rem] text-xs flex items-center gap-1",
            trendLabel ? trendClassName : "invisible"
          )}
          aria-hidden={!trendLabel}
        >
          {TrendIcon ? <TrendIcon className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
          {trendLabel || "—"}
        </p>
      </CardContent>
    </Card>
  );
}
