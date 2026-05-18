import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search } from "lucide-react";
import ProductTable from "@/components/inventory/ProductTable";
import InventoryFilterBar from "@/components/inventory/InventoryFilterBar";
import InventoryTableFooter from "@/components/inventory/InventoryTableFooter";

/**
 * Reference-aligned “Manage Products” layout (search, filters, table, pagination).
 */
export default function ManageProductsView({
  searchInput,
  onSearchInputChange,
  profileAvatarUrl,
  profileInitials,
  onCreateCategory,
  onAddProduct,
  onAddService,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  quantityFilter,
  onQuantityFilterChange,
  priceFilter,
  onPriceFilterChange,
  onOpenTools,
  isLoading,
  loadError,
  onRetry,
  products,
  currencyCode,
  sortKey,
  sortDirection,
  onSort,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) {
  return (
    <div className="min-h-screen bg-[#f6f4f2] dark:bg-background">
      <header className="border-b border-border/40 bg-[#f6f4f2]/95 dark:bg-background/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="responsive-page-shell pt-6 pb-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl sm:text-[1.65rem] font-semibold tracking-tight text-foreground">
              Manage Products
            </h1>
            <Avatar className="h-10 w-10 border border-border/60 shrink-0">
              {profileAvatarUrl ? <AvatarImage src={profileAvatarUrl} alt="" /> : null}
              <AvatarFallback className="text-xs font-medium">{profileInitials}</AvatarFallback>
            </Avatar>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search products and services"
                value={searchInput}
                onChange={(e) => onSearchInputChange(e.target.value)}
                className="h-11 sm:h-12 pl-11 rounded-full bg-card border-border/50 shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4 rounded-md uppercase text-xs tracking-wide font-semibold"
                onClick={onCreateCategory}
              >
                Create category
              </Button>
              {onAddService ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-4 rounded-md uppercase text-xs tracking-wide font-semibold"
                  onClick={onAddService}
                >
                  Add service
                </Button>
              ) : null}
              <Button
                type="button"
                className="h-11 px-5 rounded-md uppercase text-xs tracking-wide font-semibold bg-foreground text-background hover:bg-foreground/90"
                onClick={onAddProduct}
              >
                Add new product
              </Button>
            </div>
          </div>

          <InventoryFilterBar
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            typeFilter={typeFilter}
            onTypeFilterChange={onTypeFilterChange}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={onCategoryFilterChange}
            categories={categories}
            quantityFilter={quantityFilter}
            onQuantityFilterChange={onQuantityFilterChange}
            priceFilter={priceFilter}
            onPriceFilterChange={onPriceFilterChange}
            onOpenTools={onOpenTools}
          />
        </div>
      </header>

      <main className="responsive-page-shell pb-10 pt-2">
        <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm">
              <p className="text-destructive font-medium">Unable to load inventory.</p>
              <p className="text-muted-foreground mt-1">{loadError}</p>
              <Button variant="outline" className="mt-4" onClick={onRetry}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <ProductTable
                products={products}
                currencyCode={currencyCode}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                onOpenProduct={onOpenProduct}
                onEdit={onEditProduct}
                onDelete={onDeleteProduct}
              />
              <InventoryTableFooter
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
