import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import RecentActivity from "@/components/inventory/RecentActivity";

function StatTile({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

/**
 * Read-only stock breakdown for a single product. No "Reserved" tile —
 * there is no stock-reservation feature (nothing holds stock on invoice
 * send), so a real number can't be shown for it yet.
 */
export default function ProductDetailSheet({ open, onOpenChange, product, transactions = [], products = [], deliveries = [], onEdit }) {
  const [onOrderQty, setOnOrderQty] = useState(0);
  const [isLoadingOnOrder, setIsLoadingOnOrder] = useState(false);

  useEffect(() => {
    if (!open || !product?.id) {
      setOnOrderQty(0);
      return;
    }
    let cancelled = false;
    setIsLoadingOnOrder(true);
    supabase
      .from("purchase_order_items")
      .select("quantity_ordered, quantity_received, purchase_orders(status)")
      .eq("product_id", product.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setOnOrderQty(0);
          return;
        }
        const total = data
          .filter((row) => row.purchase_orders?.status === "approved")
          .reduce((sum, row) => sum + Math.max(0, Number(row.quantity_ordered) - Number(row.quantity_received || 0)), 0);
        setOnOrderQty(total);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOnOrder(false);
      });
    return () => { cancelled = true; };
  }, [open, product?.id]);

  if (!product) return null;

  const incomingQty = deliveries
    .filter((d) => d.product_id === product.id && d.status === "in_transit")
    .reduce((sum, d) => sum + Number(d.quantity || 0), 0);

  const productTransactions = transactions.filter((t) => t.product_id === product.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>{product.sku ? `SKU ${product.sku}` : "Stock overview"}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile label="Available" value={product.stock_on_hand ?? 0} />
          <StatTile label="Incoming" value={incomingQty} />
          <StatTile label="On Order" value={isLoadingOnOrder ? "…" : onOrderQty} />
          <StatTile label="Low Stock Level" value={product.reorder_level ?? "—"} />
          <StatTile label="Warehouse" value="Main Warehouse" />
        </div>

        <div className="mt-6">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onEdit?.(product)}>
            <Pencil className="w-4 h-4" /> Edit product
          </Button>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Recent Stock Activity</h3>
          <RecentActivity transactions={productTransactions} products={products} limit={20} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
