import { useState } from "react";
import { AlertTriangle, Bell, ChevronDown, ChevronUp, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

export default function LowStockAlert({ lowStockProducts, onReorder, reorderingIds = [] }) {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !lowStockProducts.length) return null;

  const outOfStock = lowStockProducts.filter((p) => (p.stock_on_hand || 0) === 0);
  const low = lowStockProducts.filter((p) => (p.stock_on_hand || 0) > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
        <button
          className="flex items-center gap-2.5 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">
              Reorder Alert
            </span>
            {outOfStock.length > 0 && (
              <Badge className="bg-status-overdue/10 text-status-overdue border-border text-xs">
                {outOfStock.length} out of stock
              </Badge>
            )}
            {low.length > 0 && (
              <Badge className="bg-status-pending/10 text-status-pending border-border text-xs">
                {low.length} low stock
              </Badge>
            )}
          </div>
          <span className="ml-auto text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-2 text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={() => setDismissed(true)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Product rows */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border divide-y divide-border">
              {lowStockProducts.map((product) => {
                const isOut = (product.stock_on_hand || 0) === 0;
                const isReordering = reorderingIds.includes(product.id);
                const suggestedQty = Math.max(
                  (product.reorder_level || 10) * 2 - (product.stock_on_hand || 0),
                  product.reorder_level || 10
                );

                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between px-4 py-3 gap-4 flex-wrap"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-1.5 rounded-lg ${isOut ? "bg-status-overdue/10" : "bg-status-pending/10"}`}>
                        <AlertTriangle className={`w-3.5 h-3.5 ${isOut ? "text-status-overdue" : "text-status-pending"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isOut ? (
                            <span className="text-status-overdue font-medium">Out of stock</span>
                          ) : (
                            <>
                              <span className="text-foreground font-medium">{product.stock_on_hand}</span>
                              {" "}/ {product.reorder_level} {product.count_style} (reorder level)
                            </>
                          )}
                          {product.sku && <span className="ml-2 text-muted-foreground">· {product.sku}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        Suggested: <strong>{suggestedQty} {product.count_style}</strong>
                      </span>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs h-8"
                        onClick={() => onReorder(product, suggestedQty)}
                        disabled={isReordering}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {isReordering ? "Creating…" : "Reorder"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

