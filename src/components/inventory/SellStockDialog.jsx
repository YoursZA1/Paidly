import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function SellStockDialog({ open, onOpenChange, products, onSell }) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSell({ product_id: productId, quantity: Number(quantity), notes });
    setProductId("");
    setQuantity(1);
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Record Sale</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.stock_on_hand || 0} {p.count_style} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity ({selectedProduct?.count_style || "units"}) *</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              max={selectedProduct?.stock_on_hand || 9999}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Available: {selectedProduct.stock_on_hand || 0} {selectedProduct.count_style}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional sale notes..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!productId || !quantity}>Record Sale</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

