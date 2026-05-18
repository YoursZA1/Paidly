import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload } from "lucide-react";
import ProductThumbnail from "@/components/inventory/ProductThumbnail";
import { uploadProductImage } from "@/lib/productImageUpload";
import { useAuth } from "@/contexts/AuthContext";

const COUNT_STYLES = ["units", "cases", "packs", "boxes", "pallets", "bottles", "bags", "rolls"];

const defaultProduct = {
  name: "",
  sku: "",
  barcode: "",
  category: "",
  count_style: "units",
  units_per_count: 1,
  stock_on_hand: 0,
  stock_capacity: 100,
  reorder_level: 10,
  cost: 0,
  price: 0,
  image_url: null,
};

export default function ProductFormDialog({ open, onOpenChange, product, onSave }) {
  const { user } = useAuth();
  const [form, setForm] = useState(defaultProduct);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      setForm({
        ...defaultProduct,
        ...product,
        cost: product.cost ?? product._raw?.cost_price ?? 0,
        stock_capacity: product.stock_capacity ?? 100,
      });
      setImagePreview(product.image_url || null);
    } else {
      setForm(defaultProduct);
      setImagePreview(null);
    }
  }, [product, open]);

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const path = await uploadProductImage(file, user.id);
      setForm((f) => ({ ...f, image_url: path }));
      setImagePreview(path);
    } catch (err) {
      window.alert(err?.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      units_per_count: Number(form.units_per_count) || 1,
      stock_on_hand: Number(form.stock_on_hand) || 0,
      stock_capacity: Number(form.stock_capacity) || 100,
      reorder_level: Number(form.reorder_level) || 10,
      cost: Number(form.cost) || 0,
      price: Number(form.price) || 0,
      barcode: String(form.barcode || "").trim(),
      sku: String(form.sku || "").trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{isEdit ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription className="sr-only">
            Add or edit inventory product with image, barcode, SKU, stock, and pricing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="flex items-center gap-4">
            <ProductThumbnail imageUrl={imagePreview || form.image_url} name={form.name} className="h-16 w-16" />
            <div className="space-y-2 flex-1 min-w-0">
              <Label>Product image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="hidden"
                onChange={handleImagePick}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {imagePreview || form.image_url ? "Change photo" : "Upload photo"}
              </Button>
              <p className="text-xs text-muted-foreground">PNG or JPEG, max 3MB</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-name">Product Name *</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ultra shea body butter"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="e.g. SU-3206"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-barcode">Barcode</Label>
              <Input
                id="product-barcode"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Scan or type barcode"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-category">Category</Label>
              <Input
                id="product-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Skin care"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-count-style">Count Style</Label>
              <Select value={form.count_style} onValueChange={(v) => setForm({ ...form, count_style: v })}>
                <SelectTrigger id="product-count-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_STYLES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-stock">Stock on hand</Label>
              <Input
                id="product-stock"
                type="number"
                min="0"
                value={form.stock_on_hand}
                onChange={(e) => setForm({ ...form, stock_on_hand: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-capacity">Shelf capacity</Label>
              <Input
                id="product-capacity"
                type="number"
                min="1"
                value={form.stock_capacity}
                onChange={(e) => setForm({ ...form, stock_capacity: e.target.value })}
                title="Used for quantity display (e.g. 51/100)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-reorder">Reorder level</Label>
              <Input
                id="product-reorder"
                type="number"
                min="0"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-cost">Cost</Label>
              <Input
                id="product-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-price">Retail price</Label>
              <Input
                id="product-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {isEdit ? "Update" : "Add Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
