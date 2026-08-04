import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Receives one or more outstanding lines of an approved PO. Each line is
 * submitted individually via onReceiveLine (receive_purchase_order_item RPC),
 * so a partial receipt (some lines, or partial quantity on a line) is fine.
 */
export default function ReceivePurchaseOrderDialog({ open, onOpenChange, purchaseOrder, items = [], productsById, onReceiveLine, isSaving }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (open) {
      const initial = {};
      items.forEach((item) => {
        const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received || 0);
        initial[item.id] = {
          quantity: outstanding > 0 ? outstanding : 0,
          unit_cost: item.unit_cost ?? 0,
        };
      });
      setDrafts(initial);
    }
  }, [open, items]);

  const outstandingItems = items.filter((item) => Number(item.quantity_received || 0) < Number(item.quantity_ordered));

  const handleReceive = async (item) => {
    const draft = drafts[item.id];
    await onReceiveLine(item.id, draft.quantity, draft.unit_cost);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive · {purchaseOrder?.po_number}</DialogTitle>
          <DialogDescription>Record stock received against this purchase order.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {outstandingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">All lines on this purchase order have been received.</p>
          ) : (
            outstandingItems.map((item) => {
              const product = productsById?.get?.(item.product_id);
              const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received || 0);
              const draft = drafts[item.id] || { quantity: outstanding, unit_cost: item.unit_cost ?? 0 };
              return (
                <div key={item.id} className="grid grid-cols-[1fr_100px_110px_100px] gap-2 items-end border-b pb-3">
                  <div>
                    <div className="text-sm font-medium">{product?.name || item.product_id}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordered {item.quantity_ordered} · Received {item.quantity_received || 0} · Outstanding {outstanding}
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      max={outstanding}
                      value={draft.quantity}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: e.target.value } }))}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Unit cost</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.unit_cost}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...prev[item.id], unit_cost: e.target.value } }))}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSaving || Number(draft.quantity) <= 0}
                    onClick={() => handleReceive(item)}
                  >
                    Receive
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
