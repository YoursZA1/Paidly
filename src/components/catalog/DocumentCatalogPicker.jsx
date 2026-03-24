import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, ChevronsUpDown, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatCurrency } from "@/components/CurrencySelector";
import { createPageUrl } from "@/utils";
import { getCatalogItemRate } from "@/utils/catalogLineItemMap";
import { SERVICES_CATALOG_LIST_OPTS } from "@/hooks/useServicesCatalogQuery";

export const SERVICE_LIST_OPTS = SERVICES_CATALOG_LIST_OPTS;

function catalogSortKey(row) {
  const t = row?.created_at || row?.created_date || row?.updated_at || row?.updated_date;
  const ms = t ? new Date(t).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

export function SavedCatalogCommand({
  catalog,
  currencyCode,
  onPick,
  onAddNew,
  emptyHint = "No saved products or services. Add them under Services.",
}) {
  const active = useMemo(
    () => (catalog || []).filter((r) => r.is_active !== false),
    [catalog]
  );
  const { products, other } = useMemo(() => {
    const prods = active.filter((c) => c.item_type === "product");
    const rest = active.filter((c) => c.item_type !== "product");
    const byNewest = (a, b) => catalogSortKey(b) - catalogSortKey(a);
    prods.sort(byNewest);
    rest.sort(byNewest);
    return { products: prods, other: rest };
  }, [active]);

  return (
    <Command>
      <CommandInput placeholder="Search saved products & services…" />
      <CommandList>
        <CommandEmpty>{emptyHint}</CommandEmpty>
        {products.length > 0 && (
          <CommandGroup heading="Products">
            {products.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.sku || ""} product`}
                onSelect={() => onPick(c)}
                className="cursor-pointer"
              >
                <span className="truncate flex-1">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatCurrency(getCatalogItemRate(c), currencyCode)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {other.length > 0 && (
          <CommandGroup heading="Services & other">
            {other.map((c) => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.sku || ""} ${c.item_type || "service"}`}
                onSelect={() => onPick(c)}
                className="cursor-pointer"
              >
                <span className="truncate flex-1">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatCurrency(getCatalogItemRate(c), currencyCode)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {typeof onAddNew === "function" && (
          <CommandGroup>
            <CommandItem onSelect={() => onAddNew()} className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />
              <span>Create new product / service</span>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup>
          <CommandItem asChild className="cursor-pointer">
            <Link to={createPageUrl("Services")}>
              <Package className="mr-2 h-4 w-4" />
              Manage catalog
            </Link>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function CatalogCombobox({
  catalog,
  value,
  onSelect,
  onAddNew,
  currencyCode = "USD",
  onRefreshCatalog,
  placeholder = "Choose saved product or service…",
}) {
  const [open, setOpen] = useState(false);
  const active = useMemo(
    () => (catalog || []).filter((r) => r.is_active !== false),
    [catalog]
  );
  const selectedLabel = value
    ? active.find((s) => s.name?.toLowerCase() === String(value).toLowerCase())?.name
    : null;

  const handleOpenChange = (next) => {
    if (next && typeof onRefreshCatalog === "function") {
      void onRefreshCatalog();
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 rounded-lg font-normal"
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="start">
        <SavedCatalogCommand
          catalog={catalog}
          currencyCode={currencyCode}
          onPick={(item) => {
            onSelect(item);
            setOpen(false);
          }}
          onAddNew={
            typeof onAddNew === "function"
              ? () => {
                  onAddNew();
                  setOpen(false);
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
