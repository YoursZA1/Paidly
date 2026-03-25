import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const statusConfig = {
  pending: { label: "Pending", class: "bg-status-pending/10 text-status-pending border-border" },
  in_transit: { label: "In Transit", class: "bg-status-sent/10 text-status-sent border-border" },
  delivered: { label: "Delivered", class: "bg-status-paid/10 text-status-paid border-border" },
  cancelled: { label: "Cancelled", class: "bg-status-overdue/10 text-status-overdue border-border" },
};

export default function DeliveryTable({ deliveries, products, onEdit, onDelete, onMarkDelivered }) {
  const getProductName = (id) => products.find((p) => p.id === id)?.name || "Unknown";
  const getCountStyle = (id) => products.find((p) => p.id === id)?.count_style || "units";
  const formatExpectedDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return format(d, "MMM d, yyyy");
  };

  if (!deliveries.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No deliveries yet</p>
        <p className="text-sm mt-1">Create a delivery to track incoming stock</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Product</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Qty</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Supplier</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Expected</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Tracking</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence>
            {deliveries.map((d, i) => {
              const cfg = statusConfig[d.status] || statusConfig.pending;
              return (
                <motion.tr
                  key={d.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <TableCell className="font-medium">{getProductName(d.product_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.quantity} {getCountStyle(d.product_id)}</TableCell>
                  <TableCell>
                    <Badge className={`${cfg.class} text-xs`}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.supplier || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatExpectedDate(d.expected_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-sm">{d.tracking_number || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {d.status !== "delivered" && d.status !== "cancelled" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => onMarkDelivered(d)} title="Mark as Delivered">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(d)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(d)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

