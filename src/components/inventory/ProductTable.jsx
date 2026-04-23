import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";

export default function ProductTable({
  products,
  onEdit,
  onDelete,
  onOpenProduct,
  currencyCode = "ZAR",
}) {
  const getStockBadge = (product) => {
    const stock = Number(product.stock_on_hand ?? 0);
    const threshold = Number(product.reorder_level ?? 10);
    if (stock <= 0) {
      return <Badge className="text-xs bg-status-overdue/15 text-status-overdue border-transparent">Out of Stock</Badge>;
    }
    if (stock <= threshold) {
      return (
        <Badge className="bg-status-pending/15 text-status-pending border-transparent text-xs">Low Stock</Badge>
      );
    }
    return <Badge className="bg-status-paid/15 text-status-paid border-transparent text-xs">In Stock</Badge>;
  };

  if (!products.length) {
    return (
      <div className="text-center py-16 text-muted-foreground px-4">
        <p className="text-lg font-medium">No products yet</p>
        <p className="text-sm mt-1">Add your first product to start tracking inventory</p>
      </div>
    );
  }

  return (
    <div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="h-10 px-4 font-medium text-[11px] uppercase tracking-wide text-muted-foreground">Product</TableHead>
            <TableHead className="h-10 px-4 font-medium text-[11px] uppercase tracking-wide text-muted-foreground text-right">Stock</TableHead>
            <TableHead className="h-10 px-4 font-medium text-[11px] uppercase tracking-wide text-muted-foreground">Status</TableHead>
            <TableHead className="h-10 px-4 font-medium text-[11px] uppercase tracking-wide text-muted-foreground text-right">Price</TableHead>
            <TableHead className="h-10 px-4 font-medium text-[11px] uppercase tracking-wide text-muted-foreground">Category</TableHead>
            <TableHead className="h-10 px-3 font-medium text-[11px] uppercase tracking-wide text-muted-foreground text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
              onClick={() => onOpenProduct?.(product)}
            >
              <TableCell className="min-w-0 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground truncate" title={product.sku ? `SKU ${product.sku}` : "No SKU"}>
                    {product.sku ? `SKU ${product.sku}` : "No SKU"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right font-semibold tabular-nums whitespace-nowrap">
                {Number(product.stock_on_hand ?? 0).toLocaleString()}
                <span className="text-xs text-muted-foreground ml-1">{product.count_style || "units"}</span>
              </TableCell>
              <TableCell className="px-4 py-3.5">{getStockBadge(product)}</TableCell>
              <TableCell className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">
                {product.price ? formatCurrency(product.price, currencyCode) : "—"}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-muted-foreground truncate">{product.category || "—"}</TableCell>
              <TableCell className="px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onOpenProduct?.(product)}>Open product</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(product)}>
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(product)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

