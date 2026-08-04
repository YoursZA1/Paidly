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
import { Textarea } from "@/components/ui/textarea";

const EMPTY_SUPPLIER = {
  name: "",
  email: "",
  phone: "",
  address: "",
  tax_number: "",
  payment_terms: "",
  lead_time_days: "",
  notes: "",
};

export default function SupplierFormDialog({ open, onOpenChange, supplier, onSave, isSaving }) {
  const [formData, setFormData] = useState(EMPTY_SUPPLIER);

  useEffect(() => {
    if (open) {
      setFormData(supplier ? { ...EMPTY_SUPPLIER, ...supplier } : EMPTY_SUPPLIER);
    }
  }, [open, supplier]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = String(formData.name || "").trim();
    if (!name) return;
    onSave({
      ...formData,
      name,
      lead_time_days: formData.lead_time_days === "" ? null : Number(formData.lead_time_days),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription>Suppliers you order stock from.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="supplier-name">Supplier Name *</Label>
            <Input
              id="supplier-name"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-phone">Phone</Label>
              <Input
                id="supplier-phone"
                value={formData.phone || ""}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier-address">Address</Label>
            <Input
              id="supplier-address"
              value={formData.address || ""}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supplier-tax">Tax ID / VAT</Label>
              <Input
                id="supplier-tax"
                value={formData.tax_number || ""}
                onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-terms">Payment Terms</Label>
              <Input
                id="supplier-terms"
                placeholder="e.g. Net 30"
                value={formData.payment_terms || ""}
                onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-lead-time">Lead Time (days)</Label>
              <Input
                id="supplier-lead-time"
                type="number"
                min="0"
                value={formData.lead_time_days ?? ""}
                onChange={(e) => setFormData({ ...formData, lead_time_days: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="supplier-notes">Notes</Label>
            <Textarea
              id="supplier-notes"
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
