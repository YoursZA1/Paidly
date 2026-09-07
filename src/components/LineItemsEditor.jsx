import { useState, useCallback, useMemo, useId, useEffect, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDown, Copy, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/components/CurrencySelector";
import { mapCatalogToLineItem } from "@/services/CatalogSyncService";
import { createPageUrl } from "@/utils";
import { normalizeCatalogItemForMap } from "@/utils/catalogLineItemMap";
import { SavedCatalogCommand } from "@/components/catalog/DocumentCatalogPicker";
import { useServicesCatalogQuery } from "@/hooks/useServicesCatalogQuery";
import { lineItemHasContent } from "@/utils/lineItemContent";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import DocumentTableDensityToggle from "@/components/document-table/DocumentTableDensityToggle";
import DocumentTableRowActions from "@/components/document-table/DocumentTableRowActions";
import DocumentLineItemsEmptyState from "@/components/document-table/DocumentLineItemsEmptyState";
import { useDocumentTableDensity } from "@/hooks/useDocumentTableDensity";
import { useDocumentTableKeyboard } from "@/hooks/useDocumentTableKeyboard";
import { documentNumericClass, documentRowCellClass } from "@/lib/documentTableClasses";
import { cn } from "@/lib/utils";
import { LINE_ITEM_TYPES } from "@shared/commercial/commercialLineItem.js";

const emptyRow = () => ({
  description: "",
  quantity: 1,
  unit_price: 0,
  total: 0,
  sku: "",
  item_type: "",
  unit_type: "",
  tax_rate: "",
  item_tax_rate: "",
  discount: "",
  discount_type: "fixed",
  service_id: null,
  catalog_item_id: null,
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
    const catalogId = li.catalog_item_id || catalogItem.id || null;
    const serviceId = li.service_id || catalogItem.id || null;
    const tax = li.item_tax_rate ?? li.tax_rate;
    return syncTotal({
      description: desc,
      quantity: li.quantity,
      unit_price: li.unit_price,
      service_id: serviceId,
      catalog_item_id: catalogId,
      sku: li.sku || catalogItem.sku || "",
      item_type: li.item_type || catalogItem.item_type || "service",
      unit_type: li.unit_type || catalogItem.default_unit || catalogItem.unit || "",
      tax_rate: tax,
      item_tax_rate: tax,
      discount: li.discount ?? "",
      discount_type: li.discount_type || "fixed",
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
  const tax = catalogItem.default_tax_rate ?? catalogItem.tax_rate ?? "";
  return syncTotal({
    description: desc,
    quantity: qty,
    unit_price: rate,
    service_id: catalogItem.id || null,
    catalog_item_id: catalogItem.id || null,
    sku: catalogItem.sku || "",
    item_type: catalogItem.item_type || "service",
    unit_type: catalogItem.default_unit || catalogItem.unit || catalogItem.unit_of_measure || "",
    tax_rate: tax,
    item_tax_rate: tax,
    discount: "",
    discount_type: "fixed",
  });
}

export default function LineItemsEditor({
  items,
  onChange,
  currencyCode,
  taxRate = 0,
  discount = 0,
  discountType,
  vatMode,
  onCreateService,
  highlightedRowIndex = null,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const lineItemsBaseId = useId();
  const descRefs = useRef([]);
  const incoming = Array.isArray(items) ? items : [];
  const hasContent = incoming.some((row) => lineItemHasContent(row));
  const [forceEditor, setForceEditor] = useState(false);
  const showTable = hasContent || forceEditor;
  const list = showTable ? (incoming.length ? incoming : [emptyRow()]) : [];
  const [catalogOpenRow, setCatalogOpenRow] = useState(null);
  const [topCatalogOpen, setTopCatalogOpen] = useState(false);
  const [activeHighlightRow, setActiveHighlightRow] = useState(null);
  const { density, setDensity, cellClass } = useDocumentTableDensity();

  const { data: catalogRows = [], isLoading: catalogLoading, refetch: refetchCatalog } = useServicesCatalogQuery();
  const catalog = useMemo(
    () => (catalogRows || []).filter((r) => r.is_active !== false),
    [catalogRows]
  );

  const currency = currencyCode || user?.currency || "ZAR";
  const showTax = list.some((row) => {
    const tax = Number(row.item_tax_rate ?? row.tax_rate);
    return Number.isFinite(tax) && tax !== 0;
  });
  const colCount = 5 + (showTax ? 1 : 0);

  const totals = useMemo(() => {
    const computed = aggregateFromItems(list, taxRate, discount, vatMode, discountType);
    return {
      subtotal: computed.subtotal,
      discountAmt: computed.discount_amount,
      taxAmount: computed.tax_amount,
      total: computed.total_amount,
    };
  }, [list, discount, discountType, taxRate, vatMode]);

  const focusDescription = useCallback((index) => {
    const el = descRefs.current[index];
    if (el && typeof el.focus === "function") el.focus();
  }, []);

  const { activeIndex, setActiveIndex, onKeyDown } = useDocumentTableKeyboard({
    rowCount: list.length,
    onEdit: focusDescription,
  });

  useEffect(() => {
    if (typeof highlightedRowIndex !== "number" || highlightedRowIndex < 0) return;
    setActiveHighlightRow(highlightedRowIndex);
    setActiveIndex(highlightedRowIndex);
    const t = window.setTimeout(() => setActiveHighlightRow(null), 1400);
    return () => window.clearTimeout(t);
  }, [highlightedRowIndex, setActiveIndex]);

  const loadCatalog = useCallback(() => {
    void refetchCatalog();
  }, [refetchCatalog]);

  const updateAt = (index, patch) => {
    const next = list.map((row, i) => (i === index ? syncTotal({ ...row, ...patch }) : row));
    onChange(next);
  };

  const addRow = () => {
    setForceEditor(true);
    onChange([...(showTable ? list : []), syncTotal(emptyRow())]);
  };

  const removeRow = (index) => {
    const next = list.filter((_, i) => i !== index);
    if (!next.length) setForceEditor(false);
    onChange(next);
  };

  const duplicateRow = (index) => {
    const copy = syncTotal({ ...list[index] });
    const next = [...list];
    next.splice(index + 1, 0, copy);
    onChange(next);
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
    setForceEditor(true);
    if (!showTable) {
      onChange([row]);
    } else {
      onChange([...list, row]);
    }
    setTopCatalogOpen(false);
  };

  const openServicesPage = () => {
    setTopCatalogOpen(false);
    setCatalogOpenRow(null);
    if (typeof onCreateService === "function") {
      onCreateService();
      return;
    }
    navigate(createPageUrl("Services"));
  };

  return (
    <div className="form-field-stack">
      <div className="flex flex-col gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="form-field">
          <Label htmlFor={`${lineItemsBaseId}-catalog-browse`} className="text-sm font-medium text-foreground">
            Select existing product or service
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
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
              emptyHint={catalogLoading ? "Loading catalog…" : "No services yet"}
            />
          </PopoverContent>
        </Popover>
        {!catalogLoading && catalog.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            No services yet.
            <Button type="button" variant="link" className="h-auto px-1 py-0 text-sm" onClick={openServicesPage}>
              + Add Service
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <DocumentTableDensityToggle density={density} onDensityChange={setDensity} />
      </div>

      {!showTable ? (
        <div className="rounded-xl border border-border/40 bg-card">
          <DocumentLineItemsEmptyState onAdd={addRow} />
        </div>
      ) : (
        <Table
          containerClassName="max-h-[min(28rem,70vh)] overflow-auto rounded-xl border border-border/40"
          className={cn("min-w-[40rem] border-separate border-spacing-0", density === "compact" && "text-sm")}
          data-density={density}
          role="grid"
          aria-label="Line items"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b [&_tr]:border-b">
            <TableRow className="border-b hover:bg-transparent">
              <TableHead className="sticky top-0 bg-background/80 backdrop-blur-sm text-left">Description</TableHead>
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Qty</TableHead>
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Rate</TableHead>
              {showTax ? (
                <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Tax</TableHead>
              ) : null}
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Total</TableHead>
              <TableHead className="sticky top-0 bg-background/80 backdrop-blur-sm text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row, index) => {
              const tax = Number(row.item_tax_rate ?? row.tax_rate);
              const selected = activeIndex === index || activeHighlightRow === index;
              return (
                <Fragment key={index}>
                <TableRow
                  className={cn("group border-b hover:bg-muted/50", selected && "bg-muted/50")}
                  data-state={selected ? "selected" : undefined}
                  onClick={() => setActiveIndex(index)}
                >
                  <TableCell className={documentRowCellClass(density, "min-w-0")}>
                    <div className="flex items-center gap-2">
                      <Input
                        ref={(el) => {
                          descRefs.current[index] = el;
                        }}
                        id={`${lineItemsBaseId}-desc-${index}`}
                        value={row.description}
                        onChange={(e) => updateAt(index, { description: e.target.value })}
                        placeholder="e.g. Website design — Phase 1"
                        className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                        aria-label={`Line ${index + 1} description`}
                      />
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
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                            disabled={catalogLoading && catalog.length === 0}
                            aria-label={`Select catalog item for line ${index + 1}`}
                          >
                            Catalog
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
                  </TableCell>
                  <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                    <Input
                      id={`${lineItemsBaseId}-qty-${index}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => updateAt(index, { quantity: parseFloat(e.target.value) || 0 })}
                      placeholder="1"
                      className="ml-auto h-8 w-[4.5rem] border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-1"
                      aria-label={`Line ${index + 1} quantity`}
                    />
                  </TableCell>
                  <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                    <Input
                      id={`${lineItemsBaseId}-unit-${index}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={row.unit_price}
                      onChange={(e) => updateAt(index, { unit_price: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="ml-auto h-8 w-[6.5rem] border-0 bg-transparent text-right tabular-nums shadow-none focus-visible:ring-1"
                      aria-label={`Line ${index + 1} rate`}
                    />
                  </TableCell>
                  {showTax ? (
                    <TableCell className={documentRowCellClass(density, documentNumericClass("text-muted-foreground"))}>
                      {Number.isFinite(tax) ? `${tax}%` : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell className={documentRowCellClass(density, documentNumericClass("font-medium"))}>
                    {formatCurrency(Number(row.total) || 0, currency)}
                  </TableCell>
                  <TableCell className={documentRowCellClass(density)}>
                    <DocumentTableRowActions>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => focusDescription(index)}
                        aria-label={`Edit line ${index + 1}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => duplicateRow(index)}
                        aria-label={`Duplicate line ${index + 1}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(index)}
                        aria-label={`Delete line ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </DocumentTableRowActions>
                  </TableCell>
                </TableRow>
                <TableRow className="border-b bg-muted/15 hover:bg-muted/25">
                  <TableCell colSpan={colCount} className="py-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-sku-${index}`} className="text-[11px] text-muted-foreground">
                          SKU
                        </Label>
                        <Input
                          id={`${lineItemsBaseId}-sku-${index}`}
                          value={row.sku || ""}
                          onChange={(e) => updateAt(index, { sku: e.target.value })}
                          placeholder="SKU"
                          className="h-8"
                          aria-label={`Line ${index + 1} SKU`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-type-${index}`} className="text-[11px] text-muted-foreground">
                          Type
                        </Label>
                        <Select
                          value={row.item_type || ""}
                          onValueChange={(value) => updateAt(index, { item_type: value === "__none" ? "" : value })}
                        >
                          <SelectTrigger id={`${lineItemsBaseId}-type-${index}`} className="h-8" aria-label={`Line ${index + 1} item type`}>
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">None</SelectItem>
                            {LINE_ITEM_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-unit-type-${index}`} className="text-[11px] text-muted-foreground">
                          Unit
                        </Label>
                        <Input
                          id={`${lineItemsBaseId}-unit-type-${index}`}
                          value={row.unit_type || ""}
                          onChange={(e) => updateAt(index, { unit_type: e.target.value })}
                          placeholder="hour / kg"
                          className="h-8"
                          aria-label={`Line ${index + 1} unit type`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-tax-${index}`} className="text-[11px] text-muted-foreground">
                          Tax %
                        </Label>
                        <Input
                          id={`${lineItemsBaseId}-tax-${index}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={row.item_tax_rate ?? row.tax_rate ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateAt(index, { tax_rate: value, item_tax_rate: value });
                          }}
                          placeholder="15"
                          className="h-8"
                          aria-label={`Line ${index + 1} tax rate`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-discount-${index}`} className="text-[11px] text-muted-foreground">
                          Discount
                        </Label>
                        <Input
                          id={`${lineItemsBaseId}-discount-${index}`}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={row.discount ?? ""}
                          onChange={(e) => updateAt(index, { discount: e.target.value })}
                          placeholder="0"
                          className="h-8"
                          aria-label={`Line ${index + 1} discount`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${lineItemsBaseId}-discount-type-${index}`} className="text-[11px] text-muted-foreground">
                          Discount type
                        </Label>
                        <Select
                          value={row.discount_type || "fixed"}
                          onValueChange={(value) => updateAt(index, { discount_type: value })}
                        >
                          <SelectTrigger id={`${lineItemsBaseId}-discount-type-${index}`} className="h-8" aria-label={`Line ${index + 1} discount type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {row.service_id || row.catalog_item_id ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Catalog {row.catalog_item_id || "—"} · Service {row.service_id || "—"}
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter className="sticky bottom-0 z-10 bg-muted/50 border-t [&_td]:border-0">
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 2} className={cn(cellClass, "text-muted-foreground")}>
                Subtotal
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                {formatCurrency(totals.subtotal, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
            {totals.discountAmt > 0 ? (
              <TableRow className="hover:bg-transparent border-0">
                <TableCell colSpan={colCount - 2} className={cn(cellClass, "text-muted-foreground")}>
                  Discount
                </TableCell>
                <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                  −{formatCurrency(totals.discountAmt, currency)}
                </TableCell>
                <TableCell />
              </TableRow>
            ) : null}
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 2} className={cn(cellClass, "text-muted-foreground")}>
                Tax{Number(taxRate) ? ` (${Number(taxRate)}%)` : ""}
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                {formatCurrency(totals.taxAmount, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 2} className={cn(cellClass, "font-medium")}>
                Total
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass("font-medium"))}>
                {formatCurrency(totals.total, currency)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
      {showTable ? (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      ) : null}
    </div>
  );
}
