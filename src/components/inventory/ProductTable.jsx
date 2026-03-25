import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ProductTable({ products, onEdit, onDelete }) {
  const getStockBadge = (product) => {
    if (product.stock_on_hand <= 0) {
      return <Badge variant="destructive" className="text-xs">Out of Stock</Badge>;
    }
    if (product.stock_on_hand <= (product.reorder_level || 10)) {
      return (
        <Badge className="bg-status-pending/10 text-status-pending border-border text-xs">
          <AlertTriangle className="w-3 h-3 mr-1" /> Low
        </Badge>
      );
    }
    return <Badge className="bg-status-paid/10 text-status-paid border-border text-xs">In Stock</Badge>;
  };

  if (!products.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">No products yet</p>
        <p className="text-sm mt-1">Add your first product to get started</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Product</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">SKU</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Category</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Count Style</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Stock On Hand</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">Status</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Price</TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence>
            {products.map((product, i) => (
              <motion.tr
                key={product.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                className="border-b border-border/40 hover:bg-muted/20 transition-colors"
              >
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">{product.sku || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{product.category || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize text-xs">
                    {product.count_style}
                    {product.units_per_count > 1 && ` (${product.units_per_count}/each)`}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {product.stock_on_hand || 0}
                </TableCell>
                <TableCell>{getStockBadge(product)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {product.price ? `$${product.price.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(product)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(product)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

