import { ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function InventoryFilterBar({
  statusFilter,
  onStatusFilterChange,
  typeFilter = "all",
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories = [],
  quantityFilter,
  onQuantityFilterChange,
  priceFilter,
  onPriceFilterChange,
  onOpenTools,
}) {
  const showActiveChip = statusFilter === "active";

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 text-muted-foreground"
        onClick={onOpenTools}
        aria-label="Inventory tools"
      >
        <ListFilter className="h-4 w-4" />
      </Button>

      {showActiveChip ? (
        <Badge
          variant="secondary"
          className="h-8 gap-1 rounded-md bg-muted/80 px-2.5 font-normal text-foreground"
        >
          Active
          <button
            type="button"
            className="rounded-sm hover:bg-muted"
            onClick={() => onStatusFilterChange("all")}
            aria-label="Clear active filter"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ) : null}

      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className="h-9 w-[120px] border-border/60 bg-card text-sm font-normal">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="product">Products</SelectItem>
          <SelectItem value="service">Services</SelectItem>
        </SelectContent>
      </Select>

      <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
        <SelectTrigger className="h-9 w-[130px] border-border/60 bg-card text-sm font-normal">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Category</SelectItem>
          {categories
            .filter((c) => c && c !== "all")
            .map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Select value={quantityFilter} onValueChange={onQuantityFilterChange}>
        <SelectTrigger className="h-9 w-[120px] border-border/60 bg-card text-sm font-normal">
          <SelectValue placeholder="Quantity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Quantity</SelectItem>
          <SelectItem value="in_stock">In stock</SelectItem>
          <SelectItem value="low">Low stock</SelectItem>
          <SelectItem value="out">Out of stock</SelectItem>
        </SelectContent>
      </Select>

      <Select value={priceFilter} onValueChange={onPriceFilterChange}>
        <SelectTrigger className="h-9 w-[110px] border-border/60 bg-card text-sm font-normal">
          <SelectValue placeholder="Price" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Price</SelectItem>
          <SelectItem value="under_50">Under 50</SelectItem>
          <SelectItem value="50_200">50 – 200</SelectItem>
          <SelectItem value="over_200">Over 200</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
