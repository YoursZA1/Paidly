import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COUNT_STYLES = ["units", "cases", "packs", "boxes", "pallets", "bottles", "bags", "rolls"];

const defaultProduct = {
  name: "", sku: "", category: "", count_style: "units",
  units_per_count: 1, stock_on_hand: 0, reorder_level: 10, price: 0,
};

export default function ProductFormDialog({ open, onOpenChange, product, onSave }) {
  const [form, setForm] = useState(defaultProduct);
  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      setForm({ ...defaultProduct, ...product });
    } else {
      setForm(defaultProduct);
    }
  }, [product, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      units_per_count: Number(form.units_per_count) || 1,
      stock_on_hand: Number(form.stock_on_hand) || 0,
      reorder_level: Number(form.reorder_level) || 10,
      price: Number(form.price) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{isEdit ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription className="sr-only">
            Add or edit a product in inventory with SKU, category, count style, stock levels, and pricing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-name">Product Name *</Label>
              <Input id="product-name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Premium Coffee Beans" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-sku">SKU</Label>
              <Input id="product-sku" name="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. COF-001" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-category">Category</Label>
              <Input id="product-category" name="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Beverages" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-count-style">Count Style *</Label>
              <Select value={form.count_style} onValueChange={(v) => setForm({ ...form, count_style: v })}>
                <SelectTrigger id="product-count-style" name="count_style"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNT_STYLES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-units-per-count">Units per {form.count_style.slice(0, -1)}</Label>
              <Input id="product-units-per-count" name="units_per_count" type="number" min="1" value={form.units_per_count} onChange={(e) => setForm({ ...form, units_per_count: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-stock-on-hand">Stock On Hand</Label>
              <Input id="product-stock-on-hand" name="stock_on_hand" type="number" min="0" value={form.stock_on_hand} onChange={(e) => setForm({ ...form, stock_on_hand: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-reorder-level">Reorder Level</Label>
              <Input id="product-reorder-level" name="reorder_level" type="number" min="0" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-price">Price per {form.count_style.slice(0, -1)}</Label>
              <Input id="product-price" name="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{isEdit ? "Update" : "Add Product"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

