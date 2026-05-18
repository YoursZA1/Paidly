import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/components/CurrencySelector";
import ProductThumbnail from "@/components/inventory/ProductThumbnail";

function SortableHead({ label, sortKey, activeKey, direction, onSort, className }) {
  const active = activeKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground font-medium hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

function statusLabel(product) {
  if (product.item_type === "service") {
    return product.is_active === false ? "Inactive" : "Active";
  }
  const stock = Number(product.stock_on_hand ?? 0);
  if (product.is_active === false) return "Inactive";
  if (stock <= 0) return "Out of stock";
  return "Active";
}

function typeLabel(product) {
  return product.item_type === "service" ? "Service" : "Product";
}

export default function ProductTable({
  products,
  onEdit,
  onDelete,
  onOpenProduct,
  currencyCode = "ZAR",
  sortKey = "name",
  sortDirection = "asc",
  onSort,
}) {
  const [selected, setSelected] = useState(() => new Set());

  const toggleAll = (checked) => {
    if (checked) setSelected(new Set(products.map((p) => p.id)));
    else setSelected(new Set());
  };

  const toggleOne = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const quantityLabel = (product) => {
    if (product.item_type === "service") return "—";
    const stock = Number(product.stock_on_hand ?? 0);
    const cap = Number(product.stock_capacity ?? Math.max(stock, product.reorder_level ?? 1, 1));
    return `${stock}/${cap}`;
  };

  const skuDisplay = (product) => {
    const sku = product.sku || "";
    const bc = product.barcode || "";
    if (sku && bc && sku !== bc) return sku;
    return sku || bc || "—";
  };

  if (!products.length) {
    return (
      <div className="text-center py-20 text-muted-foreground px-4">
        <p className="text-base font-medium text-foreground">No items found</p>
        <p className="text-sm mt-1">Try adjusting filters or add a product or service</p>
      </div>
    );
  }

  const allSelected = products.length > 0 && selected.size === products.length;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20 hover:bg-muted/20 border-b border-border/60">
            <TableHead className="w-11 px-4">
              <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(Boolean(c))} aria-label="Select all" />
            </TableHead>
            <SortableHead
              label="Product name"
              sortKey="name"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="min-w-[220px] px-2"
            />
            <SortableHead
              label="Type"
              sortKey="type"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="hidden sm:table-cell"
            />
            <SortableHead
              label="Category"
              sortKey="category"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="hidden md:table-cell"
            />
            <SortableHead
              label="SKU"
              sortKey="sku"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="hidden lg:table-cell"
            />
            <SortableHead
              label="Quantity"
              sortKey="quantity"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="text-right"
            />
            <SortableHead
              label="Cost"
              sortKey="cost"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="text-right hidden sm:table-cell"
            />
            <SortableHead
              label="Price"
              sortKey="price"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="text-right"
            />
            <SortableHead
              label="status"
              sortKey="status"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
              className="hidden sm:table-cell capitalize"
            />
            <TableHead className="w-[88px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              className="border-b border-border/40 hover:bg-muted/10 cursor-pointer"
              onClick={() => onOpenProduct?.(product)}
            >
              <TableCell className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected.has(product.id)}
                  onCheckedChange={(c) => toggleOne(product.id, Boolean(c))}
                  aria-label={`Select ${product.name}`}
                />
              </TableCell>
              <TableCell className="py-4 px-2">
                <div className="flex items-center gap-3 min-w-0">
                  <ProductThumbnail imageUrl={product.image_url} name={product.name} />
                  <p className="font-medium text-sm text-foreground truncate">{product.name}</p>
                </div>
              </TableCell>
              <TableCell className="py-4 text-sm text-muted-foreground hidden sm:table-cell capitalize">
                {typeLabel(product)}
              </TableCell>
              <TableCell className="py-4 text-sm text-muted-foreground hidden md:table-cell">
                {product.category || "—"}
              </TableCell>
              <TableCell className="py-4 text-sm text-muted-foreground font-mono hidden lg:table-cell">
                {skuDisplay(product)}
              </TableCell>
              <TableCell className="py-4 text-right text-sm tabular-nums">{quantityLabel(product)}</TableCell>
              <TableCell className="py-4 text-right text-sm tabular-nums hidden sm:table-cell">
                {product.cost ? formatCurrency(product.cost, currencyCode) : "—"}
              </TableCell>
              <TableCell className="py-4 text-right text-sm tabular-nums font-medium">
                {product.price ? formatCurrency(product.price, currencyCode) : "—"}
              </TableCell>
              <TableCell className="py-4 text-sm text-muted-foreground hidden sm:table-cell capitalize">
                {statusLabel(product)}
              </TableCell>
              <TableCell className="py-4 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpenProduct?.(product)}>Open product</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(product)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(product)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
