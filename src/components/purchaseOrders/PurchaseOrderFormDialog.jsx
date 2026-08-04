import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function emptyLine() {
  return { key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, product_id: "", quantity_ordered: 1, unit_cost: 0 };
}

export default function PurchaseOrderFormDialog({ open, onOpenChange, suppliers = [], products = [], onCreate, isSaving }) {
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);

  useEffect(() => {
    if (open) {
      setSupplierId("");
      setExpectedDate("");
      setNotes("");
      setLines([emptyLine()]);
    }
  }, [open]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key) => setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));

  const validLines = lines.filter((l) => l.product_id && Number(l.quantity_ordered) > 0);
  const total = validLines.reduce((sum, l) => sum + Number(l.quantity_ordered || 0) * Number(l.unit_cost || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validLines.length === 0) return;
    onCreate({
      supplier_id: supplierId || null,
      expected_date: expectedDate || null,
      notes: notes.trim() || null,
      items: validLines.map((l) => ({
        product_id: l.product_id,
        quantity_ordered: Number(l.quantity_ordered),
        unit_cost: Number(l.unit_cost) || 0,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Purchase Order</DialogTitle>
          <DialogDescription>Order stock from a supplier. Starts as a draft.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Supplier</Label>
              <Select value={supplierId || undefined} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a supplier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="po-expected-date">Expected Date</Label>
              <Input
                id="po-expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="w-4 h-4 mr-1" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line) => {
                const product = productById.get(line.product_id);
                return (
                  <div key={line.key} className="grid grid-cols-[1fr_90px_110px_32px] gap-2 items-center">
                    <Select value={line.product_id || undefined} onValueChange={(val) => updateLine(line.key, { product_id: val })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={line.quantity_ordered}
                      onChange={(e) => updateLine(line.key, { quantity_ordered: e.target.value })}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit cost"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {product?.stock_quantity != null && (
                      <div className="col-span-4 -mt-1 text-xs text-muted-foreground">
                        Current stock: {product.stock_quantity}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              Estimated total: {total.toFixed(2)}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || validLines.length === 0}>
              {isSaving ? "Creating..." : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
