import { useState, useCallback, useMemo, useId } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Plus, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/components/auth/AuthContext";
import { mapCatalogToLineItem } from "@/services/CatalogSyncService";
import { createPageUrl } from "@/utils";
import { normalizeCatalogItemForMap } from "@/utils/catalogLineItemMap";
import { SavedCatalogCommand } from "@/components/catalog/DocumentCatalogPicker";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";

const emptyRow = () => ({
  description: "",
  quantity: 1,
  unit_price: 0,
  total: 0,
});

function syncTotal(row) {
  const q = Number(row.quantity) || 0;
  const p = Number(row.unit_price) || 0;
  return { ...row, total: Math.round(q * p * 100) / 100 };
}

function catalogItemToLineRow(rawItem, user, quantity = 1) {
  const catalogItem = normalizeCatalogItemForMap(rawItem);
  if (!catalogItem) return syncTotal(emptyRow());

  const qty = Math.max(1, Number(quantity) || 1);
  const mapped = mapCatalogToLineItem(catalogItem, qty, {
    existingTaxRate: 0,
    userId: user?.id ?? null,
  });

  if (mapped?.success) {
    const li = mapped.lineItem;
    const desc = [li.service_name, li.description].filter(Boolean).join("\n");
    return syncTotal({
      description: desc,
      quantity: li.quantity,
      unit_price: li.unit_price,
      catalog_item_id: li.catalog_item_id,
    });
  }

  const rate =
    Number(
      catalogItem.default_rate ??
        catalogItem.rate ??
        catalogItem.price ??
        catalogItem.unit_price ??
        0
    ) || 0;
  const desc = [catalogItem.name, catalogItem.description].filter(Boolean).join("\n");
  return syncTotal({
    description: desc,
    quantity: qty,
    unit_price: rate,
  });
}

export default function LineItemsEditor({ items, onChange, currencyCode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const lineItemsBaseId = useId();
  const list = Array.isArray(items) && items.length > 0 ? items : [emptyRow()];
  const [catalogOpenRow, setCatalogOpenRow] = useState(null);
  const [topCatalogOpen, setTopCatalogOpen] = useState(false);

  const { data: catalogRows = [], isLoading: catalogLoading, refetch: refetchCatalog } = useServicesCatalogQuery();
  const catalog = useMemo(
    () => (catalogRows || []).filter((r) => r.is_active !== false),
    [catalogRows]
  );

  const currency = currencyCode || user?.currency || "ZAR";

  const loadCatalog = useCallback(() => {
    void refetchCatalog();
  }, [refetchCatalog]);

  const updateAt = (index, patch) => {
    const next = list.map((row, i) => (i === index ? syncTotal({ ...row, ...patch }) : row));
    onChange(next);
  };

  const addRow = () => onChange([...list, syncTotal(emptyRow())]);

  const removeRow = (index) => {
    if (list.length <= 1) {
      onChange([syncTotal(emptyRow())]);
      return;
    }
    onChange(list.filter((_, i) => i !== index));
  };

  const applyCatalogItem = (index, rawItem) => {
    const qty = Math.max(1, Number(list[index]?.quantity) || 1);
    const row = catalogItemToLineRow(rawItem, user, qty);
    const next = list.map((r, i) => (i === index ? row : r));
    onChange(next);
    setCatalogOpenRow(null);
  };

  const appendFromCatalog = (rawItem) => {
    const row = catalogItemToLineRow(rawItem, user, 1);
    const hasOnlyBlank =
      list.length === 1 &&
      !(list[0].description || "").trim() &&
      !(Number(list[0].quantity) && Number(list[0].unit_price));
    if (hasOnlyBlank) {
      onChange([row]);
    } else {
      onChange([...list, row]);
    }
    setTopCatalogOpen(false);
  };

  const openServicesPage = () => {
    setTopCatalogOpen(false);
    setCatalogOpenRow(null);
    navigate(createPageUrl("Services"));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div>
          <Label htmlFor={`${lineItemsBaseId}-catalog-browse`} className="text-sm font-medium text-foreground">
            Select existing product or service
          </Label>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Pick from your saved catalog (same list as{" "}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline font-medium"
              onClick={openServicesPage}
            >
              Products &amp; Services
            </button>
            ). Each choice adds a line item below; you can still edit quantity and price afterward.
          </p>
        </div>
        <Popover
          open={topCatalogOpen}
          onOpenChange={(open) => {
            if (open) void loadCatalog();
            setTopCatalogOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id={`${lineItemsBaseId}-catalog-browse`}
              type="button"
              variant="secondary"
              size="sm"
              className="gap-2"
              disabled={catalogLoading && catalog.length === 0}
            >
              <Package className="h-4 w-4" />
              Browse saved catalog
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(100vw-2rem,24rem)] p-0" align="start">
            <SavedCatalogCommand
              catalog={catalog}
              currencyCode={currency}
              onPick={appendFromCatalog}
              onAddNew={openServicesPage}
              emptyHint={
                catalogLoading
                  ? "Loading catalog…"
                  : "No saved products or services yet. Add them under Products & Services."
              }
            />
          </PopoverContent>
        </Popover>
      </div>

      {list.map((row, index) => (
        <div
          key={index}
          className="grid gap-3 sm:grid-cols-[1fr_80px_100px_100px_auto] sm:items-end border border-border rounded-lg p-3"
        >
          <div className="space-y-2 sm:col-span-1 col-span-full">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={`${lineItemsBaseId}-desc-${index}`} className="text-xs text-muted-foreground">
                Description
              </Label>
              <Popover
                open={catalogOpenRow === index}
                onOpenChange={(open) => {
                  if (open) {
                    void loadCatalog();
                    setCatalogOpenRow(index);
                  } else {
                    setCatalogOpenRow(null);
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs shrink-0"
                    disabled={catalogLoading && catalog.length === 0}
                  >
                    Select from catalog
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="end">
                  <SavedCatalogCommand
                    catalog={catalog}
                    currencyCode={currency}
                    onPick={(c) => applyCatalogItem(index, c)}
                    onAddNew={openServicesPage}
                    emptyHint={
                      catalogLoading
                        ? "Loading catalog…"
                        : "No matches. Add items under Products & Services or try another search."
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Input
              id={`${lineItemsBaseId}-desc-${index}`}
              value={row.description}
              onChange={(e) => updateAt(index, { description: e.target.value })}
              placeholder="Service or product"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${lineItemsBaseId}-qty-${index}`} className="text-xs text-muted-foreground">
              Qty
            </Label>
            <Input
              id={`${lineItemsBaseId}-qty-${index}`}
              type="number"
              min={0}
              step="0.01"
              value={row.quantity}
              onChange={(e) => updateAt(index, { quantity: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${lineItemsBaseId}-unit-${index}`} className="text-xs text-muted-foreground">
              Unit
            </Label>
            <Input
              id={`${lineItemsBaseId}-unit-${index}`}
              type="number"
              min={0}
              step="0.01"
              value={row.unit_price}
              onChange={(e) => updateAt(index, { unit_price: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${lineItemsBaseId}-total-${index}`} className="text-xs text-muted-foreground">
              Total
            </Label>
            <Input
              id={`${lineItemsBaseId}-total-${index}`}
              type="text"
              readOnly
              value={(Number(row.total) || 0).toFixed(2)}
              className="bg-muted/50"
            />
          </div>
          <div className="flex sm:justify-end pb-0.5">
            <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)} aria-label="Remove line">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addRow}>
        <Plus className="h-4 w-4" />
        Add line
      </Button>
    </div>
  );
}
