import { useMemo } from "react";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DocumentTableDensityToggle from "@/components/document-table/DocumentTableDensityToggle";
import DocumentLineItemsEmptyState from "@/components/document-table/DocumentLineItemsEmptyState";
import { useDocumentTableDensity } from "@/hooks/useDocumentTableDensity";
import { useDocumentTableKeyboard } from "@/hooks/useDocumentTableKeyboard";
import { documentNumericClass, documentRowCellClass } from "@/lib/documentTableClasses";
import { cn } from "@/lib/utils";
import { aggregateFromItems, isLegacyDiscountLine } from "@/document-engine/documentTotals";

function lineDescription(item) {
  return [item.service_name, item.name, item.description].filter(Boolean).join(" — ") || "—";
}

function lineTotal(item) {
  if (item.total != null && item.total !== "") return Number(item.total) || 0;
  if (item.total_price != null && item.total_price !== "") return Number(item.total_price) || 0;
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unit_price) || 0;
  return Math.round(qty * price * 100) / 100;
}

function lineTax(item) {
  const raw = item.item_tax_rate ?? item.tax_rate;
  if (raw == null || raw === "") return null;
  return Number(raw);
}

export default function DocumentLineItemsViewTable({
  items,
  currencyCode,
  taxRate = 0,
  discount = 0,
  discountType,
  vatMode,
  storedTotals,
  className,
}) {
  const { density, setDensity, cellClass } = useDocumentTableDensity();
  const rows = (Array.isArray(items) ? items : []).filter((item) => !isLegacyDiscountLine(item));
  const currency = currencyCode || "ZAR";
  const showTax = useMemo(
    () => rows.some((row) => lineTax(row) != null && Number(lineTax(row)) !== 0),
    [rows]
  );
  const colCount = 4 + (showTax ? 1 : 0);
  const { activeIndex, setActiveIndex, onKeyDown } = useDocumentTableKeyboard({ rowCount: rows.length });

  const totals = useMemo(() => {
    if (storedTotals) {
      return {
        subtotal: Number(storedTotals.subtotal) || 0,
        discountAmt: Number(storedTotals.discountAmt ?? storedTotals.discount_amount) || 0,
        taxAmount: Number(storedTotals.taxAmount ?? storedTotals.tax_amount) || 0,
        total: Number(storedTotals.total ?? storedTotals.total_amount) || 0,
      };
    }
    const computed = aggregateFromItems(rows, taxRate, discount, vatMode, discountType);
    return {
      subtotal: computed.subtotal,
      discountAmt: computed.discount_amount,
      taxAmount: computed.tax_amount,
      total: computed.total_amount,
    };
  }, [rows, discount, discountType, taxRate, vatMode, storedTotals]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Line items</h2>
        {rows.length > 0 ? (
          <DocumentTableDensityToggle density={density} onDensityChange={setDensity} />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-border/40">
          <DocumentLineItemsEmptyState />
        </div>
      ) : (
        <Table
          containerClassName="max-h-[min(28rem,70vh)] overflow-auto rounded-xl border border-border/40"
          className={cn("min-w-[36rem] border-separate border-spacing-0", density === "compact" && "text-sm")}
          role="grid"
          aria-label="Line items"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <TableHeader className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
            <TableRow className="border-b hover:bg-transparent">
              <TableHead className="sticky top-0 bg-background/80 backdrop-blur-sm text-left">Description</TableHead>
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Qty</TableHead>
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Rate</TableHead>
              {showTax ? (
                <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Tax</TableHead>
              ) : null}
              <TableHead className={cn("sticky top-0 bg-background/80 backdrop-blur-sm", documentNumericClass())}>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item, index) => {
              const tax = lineTax(item);
              const selected = activeIndex === index;
              return (
                <TableRow
                  key={item.id || item.key || index}
                  className={cn("group border-b hover:bg-muted/50", selected && "bg-muted/50")}
                  data-state={selected ? "selected" : undefined}
                  onClick={() => setActiveIndex(index)}
                >
                  <TableCell className={documentRowCellClass(density, "min-w-0 text-left")}>
                    <p className="font-medium leading-snug text-foreground">{lineDescription(item)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {[
                        item.sku ? `SKU ${item.sku}` : null,
                        item.item_type || null,
                        item.unit_type ? `unit ${item.unit_type}` : null,
                        item.discount != null && item.discount !== "" && Number(item.discount) > 0
                          ? `discount ${item.discount}${item.discount_type === "percentage" ? "%" : ""}`
                          : null,
                        item.catalog_item_id ? `catalog ${item.catalog_item_id}` : null,
                        item.service_id ? `service ${item.service_id}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No SKU, type, or catalog reference"}
                    </p>
                  </TableCell>
                  <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                    {Number(item.quantity) || 0}
                  </TableCell>
                  <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                    {formatCurrency(Number(item.unit_price) || 0, currency)}
                  </TableCell>
                  {showTax ? (
                    <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                      {tax == null ? "—" : `${tax}%`}
                    </TableCell>
                  ) : null}
                  <TableCell className={documentRowCellClass(density, documentNumericClass("font-medium"))}>
                    {formatCurrency(lineTotal(item), currency)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter className="sticky bottom-0 z-10 bg-muted/50 border-t [&_td]:border-0">
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 1} className={cn(cellClass, "text-muted-foreground")}>
                Subtotal
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                {formatCurrency(totals.subtotal, currency)}
              </TableCell>
            </TableRow>
            {totals.discountAmt > 0 ? (
              <TableRow className="hover:bg-transparent border-0">
                <TableCell colSpan={colCount - 1} className={cn(cellClass, "text-muted-foreground")}>
                  Discount
                </TableCell>
                <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                  −{formatCurrency(totals.discountAmt, currency)}
                </TableCell>
              </TableRow>
            ) : null}
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 1} className={cn(cellClass, "text-muted-foreground")}>
                Tax{Number(taxRate) ? ` (${Number(taxRate)}%)` : ""}
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass())}>
                {formatCurrency(totals.taxAmount, currency)}
              </TableCell>
            </TableRow>
            <TableRow className="hover:bg-transparent border-0">
              <TableCell colSpan={colCount - 1} className={cn(cellClass, "font-medium")}>
                Total
              </TableCell>
              <TableCell className={documentRowCellClass(density, documentNumericClass("font-medium"))}>
                {formatCurrency(totals.total, currency)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
