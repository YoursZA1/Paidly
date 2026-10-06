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
import { formatCurrency } from "@/components/CurrencySelector";
import { purchaseOrderLineReceivedAmounts } from "@shared/procurement/purchaseOrderMath.js";

const netUnitCost = (item) =>
  Math.round(Number(item.unit_cost || 0) * (1 - Number(item.discount_percent || 0) / 100) * 100) / 100;

/**
 * Receives one or more outstanding lines of an approved PO. onReceiveLines gets
 * [{ id, quantity, unit_cost }] and submits each line via the receive_purchase_order_item RPC, so a
 * partial receipt (some lines, or part of a line) is fine. Catalog products go into stock at the stock
 * cost entered; custom lines just record receipt (unit_cost null).
 */
export default function ReceivePurchaseOrderDialog({ open, onOpenChange, purchaseOrder, items = [], productsById, onReceiveLines, isSaving }) {
  const [drafts, setDrafts] = useState({});
  const currency = purchaseOrder?.currency || "ZAR";

  useEffect(() => {
    if (open) {
      const initial = {};
      items.forEach((item) => {
        const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received || 0);
        initial[item.id] = {
          quantity: outstanding > 0 ? outstanding : 0,
          unit_cost: netUnitCost(item),
        };
      });
      setDrafts(initial);
    }
  }, [open, items]);

  const outstandingItems = items.filter((item) => Number(item.quantity_received || 0) < Number(item.quantity_ordered));

  const draftFor = (item) => {
    const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received || 0);
    return drafts[item.id] || { quantity: outstanding, unit_cost: netUnitCost(item) };
  };

  const lineFor = (item) => {
    const draft = draftFor(item);
    return { id: item.id, quantity: draft.quantity, unit_cost: item.product_id ? draft.unit_cost : null };
  };

  const handleReceive = (item) => onReceiveLines([lineFor(item)]);

  const handleReceiveAll = () =>
    onReceiveLines(outstandingItems.map(lineFor).filter((line) => Number(line.quantity) > 0));

  const receivingValue = outstandingItems.reduce((sum, item) => {
    const qty = Number(draftFor(item).quantity) || 0;
    return sum + purchaseOrderLineReceivedAmounts({ ...item, quantity_received: qty }).total;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive · {purchaseOrder?.po_number}</DialogTitle>
          <DialogDescription>
            Record what arrived. Received goods become an amount owed to the supplier — not an expense until you pay.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {outstandingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">All lines on this purchase order have been received.</p>
          ) : (
            outstandingItems.map((item) => {
              const product = productsById?.get?.(item.product_id);
              const outstanding = Number(item.quantity_ordered) - Number(item.quantity_received || 0);
              const draft = draftFor(item);
              return (
                <div key={item.id} className="grid grid-cols-2 sm:grid-cols-[1fr_96px_120px_96px] gap-2 items-end border-b pb-3">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <div className="text-sm font-medium truncate">{product?.name || item.description || "Item"}</div>
                    <div className="text-xs text-muted-foreground">
                      Ordered {item.quantity_ordered} · Received {item.quantity_received || 0} · Outstanding {outstanding}
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      max={outstanding}
                      value={draft.quantity}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, quantity: e.target.value } }))}
                    />
                  </div>
                  {item.product_id ? (
                    <div className="grid gap-1">
                      <Label className="text-xs">Stock cost / unit</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.unit_cost}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, unit_cost: e.target.value } }))}
                      />
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground self-center">No stock</div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSaving || Number(draft.quantity) <= 0 || Number(draft.quantity) > outstanding}
                    onClick={() => handleReceive(item)}
                  >
                    Receive
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 sm:items-center">
          {outstandingItems.length > 0 && (
            <span className="text-xs text-muted-foreground sm:mr-auto">
              Receiving {formatCurrency(receivingValue, currency)} at PO prices
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          {outstandingItems.length > 1 && (
            <Button type="button" onClick={handleReceiveAll} disabled={isSaving}>
              Receive all
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
