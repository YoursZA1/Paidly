import { memo, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DUPLICATE_ACTIONS, PRODUCT_ONLY_FIELDS, ROW_STATUS } from "@shared/catalog/productImport.js";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "name", label: "Product Name", width: "min-w-[12rem]" },
  { key: "sku", label: "SKU", width: "min-w-[7rem]" },
  { key: "description", label: "Description", width: "min-w-[12rem]" },
  { key: "category", label: "Category", width: "min-w-[8rem]" },
  { key: "cost_price", label: "Cost Price", width: "min-w-[6rem]" },
  { key: "price", label: "Selling Price", width: "min-w-[6rem]" },
  { key: "vat", label: "VAT", width: "min-w-[4.5rem]" },
  { key: "stock", label: "Stock", width: "min-w-[4.5rem]" },
  { key: "barcode", label: "Barcode", width: "min-w-[8rem]" },
];

const STATUS_STYLE = {
  [ROW_STATUS.READY]: { label: "Ready", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  [ROW_STATUS.WARNING]: { label: "Warning", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  [ROW_STATUS.ERROR]: { label: "Error", cls: "bg-destructive/15 text-destructive" },
  [ROW_STATUS.DUPLICATE]: { label: "Duplicate", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: ROW_STATUS.READY, label: "Ready" },
  { key: ROW_STATUS.WARNING, label: "Warnings" },
  { key: ROW_STATUS.ERROR, label: "Errors" },
  { key: ROW_STATUS.DUPLICATE, label: "Duplicates" },
];

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status];
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", s.cls)}>{s.label}</span>;
}

/** Keeps typing local; commits on blur / Enter so the whole review doesn't re-validate per keystroke. */
function EditableCell({ value, onCommit, invalid, label, className }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const commit = () => {
    if ((draft ?? "") !== (value ?? "")) onCommit(draft);
  };
  return (
    <input
      value={draft}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value ?? "");
      }}
      className={cn(
        "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-xs outline-none transition-colors hover:border-border focus:border-ring focus:bg-background",
        invalid && "border-destructive/60 bg-destructive/5",
        className
      )}
    />
  );
}

function DuplicateAction({ row, onAction, compact = false }) {
  if (!row.duplicate && !row.fileDuplicate) return null;
  const by = row.duplicate
    ? `Matches “${row.duplicate.name}” by ${row.duplicate.matchedBy === "sku" ? "SKU" : row.duplicate.matchedBy}`
    : `Same SKU as row ${row.fileDuplicate.firstRow}`;
  return (
    <div className="space-y-1">
      <p className={cn("text-[11px] text-sky-700 dark:text-sky-400", !compact && "truncate")} title={by}>
        {by}
      </p>
      <Select value={row.effectiveAction} onValueChange={(v) => onAction(row.id, v)}>
        <SelectTrigger className="h-8 text-xs" aria-label={`Duplicate handling for row ${row.rowNumber}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DUPLICATE_ACTIONS.SKIP}>Skip duplicate</SelectItem>
          {row.canUpdate ? <SelectItem value={DUPLICATE_ACTIONS.UPDATE}>Update existing</SelectItem> : null}
          <SelectItem value={DUPLICATE_ACTIONS.CREATE}>Import as new</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Issues({ row }) {
  const items = [...row.errors.map((e) => ({ ...e, level: "error" })), ...row.warnings.map((w) => ({ ...w, level: "warning" }))];
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5">
      {items.slice(0, 3).map((it, i) => (
        <li key={i} className={cn("text-[11px] leading-snug", it.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400")} title={it.fix || undefined}>
          {it.message}
        </li>
      ))}
      {items.length > 3 ? <li className="text-[11px] text-muted-foreground">+{items.length - 3} more</li> : null}
    </ul>
  );
}

const DesktopRow = memo(function DesktopRow({ row, columns, onEdit, onToggle, onAction }) {
  const errorFields = new Set(row.errors.map((e) => e.field));
  return (
    <tr className={cn("border-b align-top", !row.selected && "opacity-50")}>
      <td className="sticky left-0 z-10 bg-background px-2 py-2">
        <Checkbox checked={row.selected} onCheckedChange={(v) => onToggle(row.id, v === true)} aria-label={`Include row ${row.rowNumber}`} />
      </td>
      <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
        {row.rowNumber}
        {row.meta?.page ? <div className="text-[10px]">p.{row.meta.page}</div> : null}
      </td>
      {columns.map((c) => (
        <td key={c.key} className={cn("px-1 py-1", c.width)}>
          <EditableCell
            value={row.raw[c.key] ?? ""}
            invalid={errorFields.has(c.key)}
            label={`${c.label}, row ${row.rowNumber}`}
            onCommit={(v) => onEdit(row.id, c.key, v)}
            className={["cost_price", "price", "stock", "vat"].includes(c.key) ? "text-right tabular-nums" : ""}
          />
        </td>
      ))}
      <td className="px-2 py-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="min-w-[14rem] max-w-[18rem] px-2 py-2 space-y-1.5">
        <DuplicateAction row={row} onAction={onAction} />
        <Issues row={row} />
      </td>
    </tr>
  );
});

function MobileCard({ row, columns, onEdit, onToggle, onAction }) {
  const [editing, setEditing] = useState(row.status === ROW_STATUS.ERROR);
  const errorFields = new Set(row.errors.map((e) => e.field));
  const v = row.value;
  return (
    <li className={cn("rounded-xl border p-3 space-y-2", !row.selected && "opacity-60")}>
      <div className="flex items-start gap-2">
        <Checkbox className="mt-0.5" checked={row.selected} onCheckedChange={(x) => onToggle(row.id, x === true)} aria-label={`Include row ${row.rowNumber}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{v.name || <span className="text-destructive">No name</span>}</p>
          <p className="text-xs text-muted-foreground">
            Row {row.rowNumber}
            {v.sku ? ` · ${v.sku}` : ""}
            {v.price != null ? ` · ${v.price.toFixed(2)}` : ""}
            {v.stock != null ? ` · ${v.stock} in stock` : ""}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <Issues row={row} />
      <DuplicateAction row={row} onAction={onAction} compact />
      {editing ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {columns.map((c) => (
            <label key={c.key} className={cn("space-y-0.5", ["name", "description"].includes(c.key) && "col-span-2")}>
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
              <EditableCell
                value={row.raw[c.key] ?? ""}
                invalid={errorFields.has(c.key)}
                label={`${c.label}, row ${row.rowNumber}`}
                onCommit={(x) => onEdit(row.id, c.key, x)}
                className="border-border text-sm h-9"
              />
            </label>
          ))}
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
      )}
    </li>
  );
}

/**
 * "Review Products": counts, filters, and every row editable before anything is saved.
 */
export default function ImportReviewStep({ rows, summary, itemType, initialFilter = "all", onEdit, onToggle, onToggleMany, onAction }) {
  const [filter, setFilter] = useState(initialFilter);
  const [page, setPage] = useState(1);
  useEffect(() => setFilter(initialFilter), [initialFilter]);
  useEffect(() => setPage(1), [filter]);

  const columns = useMemo(() => COLUMNS.filter((c) => itemType !== "service" || !PRODUCT_ONLY_FIELDS.includes(c.key)), [itemType]);
  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [filter, rows]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => r.selected);
  const counts = { all: summary.total, ...summary };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Products", value: summary.total, cls: "" },
          { label: "Warnings", value: summary.warning, cls: "text-amber-700 dark:text-amber-400" },
          { label: "Duplicates", value: summary.duplicate, cls: "text-sky-700 dark:text-sky-400" },
          { label: "Invalid rows", value: summary.error, cls: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={cn("text-lg font-semibold tabular-nums", s.cls)}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter rows">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === f.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label} {(counts[f.key] ?? 0).toLocaleString()}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No rows here.</p>
      ) : (
        <>
          <div className="hidden min-h-0 flex-1 overflow-auto rounded-lg border md:block">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-20 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-30 bg-muted px-2 py-2">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => onToggleMany(visible.map((r) => r.id), v === true)}
                      aria-label="Include all rows on this page"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Row</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <DesktopRow key={row.id} row={row} columns={columns} onEdit={onEdit} onToggle={onToggle} onAction={onAction} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {visible.map((row) => (
              <MobileCard key={row.id} row={row} columns={columns} onEdit={onEdit} onToggle={onToggle} onAction={onAction} />
            ))}
          </ul>
        </>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
          </span>
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
