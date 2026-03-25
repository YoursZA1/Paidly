import { format } from "date-fns";
import { ArrowDown, ArrowUp, RotateCcw, Package } from "lucide-react";

const typeConfig = {
  sold: { icon: ArrowUp, color: "text-red-500 bg-red-50", label: "Sold" },
  received: { icon: ArrowDown, color: "text-emerald-600 bg-emerald-50", label: "Received" },
  adjusted: { icon: RotateCcw, color: "text-blue-500 bg-blue-50", label: "Adjusted" },
  returned: { icon: Package, color: "text-amber-600 bg-amber-50", label: "Returned" },
};

export default function RecentActivity({ transactions, products }) {
  const getProductName = (id) => products.find((p) => p.id === id)?.name || "Unknown";
  const getCountStyle = (id) => products.find((p) => p.id === id)?.count_style || "units";
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
    <div className="space-y-3">
      {transactions.slice(0, 8).map((t) => {
        const cfg = typeConfig[t.type] || typeConfig.adjusted;
        const Icon = cfg.icon;
        return (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors">
            <div className={`p-2 rounded-lg ${cfg.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {cfg.label}: {getProductName(t.product_id)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.quantity} {getCountStyle(t.product_id)} · {safeDateText(t.created_date)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

