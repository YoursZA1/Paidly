import { format } from "date-fns";
import { ArrowDown, ArrowUp, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

const typeConfig = {
  sale: { icon: ArrowUp, color: "text-status-overdue bg-status-overdue/10", label: "Sale" },
  restock: { icon: ArrowDown, color: "text-status-paid bg-status-paid/10", label: "Restock" },
  delivery: { icon: Truck, color: "text-status-sent bg-status-sent/10", label: "Delivery" },
  other: { icon: PackageCheck, color: "text-muted-foreground bg-muted", label: "Update" },
};

export default function RecentActivity({ transactions, products, limit = 8, onViewAll, compact = false }) {
  const getProductName = (id) => products.find((p) => p.id === id)?.name || "Unknown";
  const getCountStyle = (id) => products.find((p) => p.id === id)?.count_style || "units";

  const toActivityType = (row) => {
    if (row.source === "delivery") return "delivery";
    if (row.type === "sold" || row.type === "out") return "sale";
    if (row.type === "received" || row.type === "in") return "restock";
    return "other";
  };

  const safeDateText = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "Date unavailable";
    return format(d, "MMM d, h:mm a");
  };

  if (!transactions.length) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.slice(0, limit).map((t) => {
        const cfg = typeConfig[toActivityType(t)] || typeConfig.other;
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-lg hover:bg-muted/30 transition-colors ${
              compact ? "p-2" : "p-2.5"
            }`}
          >
            <div className={`p-2 rounded-md ${cfg.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">
                {cfg.label}: {getProductName(t.product_id)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t.type === "out" || t.type === "sold" ? "-" : "+"}
                {Math.abs(Number(t.quantity ?? 0))} {getCountStyle(t.product_id)} · {safeDateText(t.created_at || t.created_date)}
              </p>
            </div>
          </div>
        );
      })}
      {onViewAll ? (
        <div className="pt-1">
          <Button variant="link" className="px-0 h-auto text-sm" onClick={onViewAll}>
            View all activity
          </Button>
        </div>
      ) : null}
    </div>
  );
}

