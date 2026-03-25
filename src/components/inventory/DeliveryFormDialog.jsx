import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

const defaultForm = {
  product_id: "", quantity: 1, status: "pending",
  supplier: "", expected_date: format(new Date(), "yyyy-MM-dd"),
  tracking_number: "", delivery_address: "", notes: "",
};

const ADDRESS_MARKER = "DELIVERY_ADDRESS:\n";

function splitNotesAndAddress(rawNotes) {
  const notes = String(rawNotes || "");
  const idx = notes.indexOf(ADDRESS_MARKER);
  if (idx === -1) return { delivery_address: "", notes };

  const after = notes.slice(idx + ADDRESS_MARKER.length);
  const parts = after.split("\n\n---\n\n");
  const delivery_address = (parts[0] || "").trim();
  const remainingNotes = (parts.slice(1).join("\n\n---\n\n") || "").trim();
  return { delivery_address, notes: remainingNotes };
}

export default function DeliveryFormDialog({ open, onOpenChange, delivery, products, onSave }) {
  const [form, setForm] = useState(defaultForm);
  const isEdit = !!delivery;

  useEffect(() => {
    if (delivery) {
      const { delivery_address, notes } = splitNotesAndAddress(delivery?.notes);
      setForm({ ...defaultForm, ...delivery, delivery_address, notes });
    } else {
      setForm(defaultForm);
    }
  }, [delivery, open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, quantity: Number(form.quantity) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{isEdit ? "Edit Delivery" : "New Delivery"}</DialogTitle>
          <DialogDescription className="sr-only">
            Create or update a delivery, including quantity, supplier, expected date, tracking number, and delivery address.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="delivery_product_id">Product *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger id="delivery_product_id" name="product_id"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery_quantity">Quantity *</Label>
              <Input id="delivery_quantity" name="quantity" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery_status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger id="delivery_status" name="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery_supplier">Supplier</Label>
              <Input id="delivery_supplier" name="supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery_expected_date">Expected Date</Label>
              <Input id="delivery_expected_date" name="expected_date" type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="delivery_tracking_number">Tracking Number</Label>
              <Input id="delivery_tracking_number" name="tracking_number" value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} placeholder="Optional" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="delivery_address">Delivery Address</Label>
              <Textarea
                id="delivery_address"
                name="delivery_address"
                value={form.delivery_address}
                onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                rows={3}
                placeholder="Street, city, postal code"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="delivery_notes">Notes</Label>
              <Textarea id="delivery_notes" name="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!form.product_id}>{isEdit ? "Update" : "Create Delivery"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

