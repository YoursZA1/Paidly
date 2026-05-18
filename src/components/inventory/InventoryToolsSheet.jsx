import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Barcode, Package, ShoppingCart, Truck } from "lucide-react";
import RecentActivity from "@/components/inventory/RecentActivity";
import DeliveryTable from "@/components/inventory/DeliveryTable";
import LowStockAlert from "@/components/inventory/LowStockAlert";

export default function InventoryToolsSheet({
  open,
  onOpenChange,
  view,
  onViewChange,
  products,
  transactions,
  deliveries,
  lowStockProducts,
  reorderingIds,
  onScanReceive,
  onScanSell,
  onRecordSale,
  onNewDelivery,
  onReorder,
  onEditDelivery,
  onDeleteDelivery,
  onMarkDelivered,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Inventory tools</SheetTitle>
          <SheetDescription>Stock movements, deliveries, and barcode scanning</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 mt-4">
          <Button size="sm" variant={view === "actions" ? "secondary" : "outline"} onClick={() => onViewChange("actions")}>
            Actions
          </Button>
          <Button size="sm" variant={view === "stock" ? "secondary" : "outline"} onClick={() => onViewChange("stock")}>
            Stock history
          </Button>
          <Button
            size="sm"
            variant={view === "deliveries" ? "secondary" : "outline"}
            onClick={() => onViewChange("deliveries")}
          >
            Deliveries
          </Button>
        </div>

        {view === "actions" ? (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={onScanReceive}>
                <Barcode className="h-4 w-4" />
                Scan receive
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={onScanSell}>
                <Barcode className="h-4 w-4" />
                Scan sale
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={onRecordSale}>
                <ShoppingCart className="h-4 w-4" />
                Record sale
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={onNewDelivery}>
                <Truck className="h-4 w-4" />
                New delivery
              </Button>
            </div>
            <LowStockAlert
              lowStockProducts={lowStockProducts}
              reorderingIds={reorderingIds}
              onReorder={onReorder}
            />
            <div className="rounded-lg border border-border/50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <Package className="h-4 w-4" />
                Recent activity
              </div>
              <RecentActivity transactions={transactions} products={products} limit={8} compact />
            </div>
          </div>
        ) : null}

        {view === "stock" ? (
          <div className="mt-6">
            <RecentActivity transactions={transactions} products={products} limit={24} />
          </div>
        ) : null}

        {view === "deliveries" ? (
          <div className="mt-6">
            <DeliveryTable
              deliveries={deliveries}
              products={products}
              onEdit={onEditDelivery}
              onDelete={onDeleteDelivery}
              onMarkDelivered={onMarkDelivered}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
