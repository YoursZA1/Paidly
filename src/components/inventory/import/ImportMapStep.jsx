import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { IGNORE_COLUMN, PRODUCT_IMPORT_FIELDS, PRODUCT_ONLY_FIELDS } from "@shared/catalog/productImport.js";

function samplesFor(table, col) {
  const out = [];
  for (const r of table.rows) {
    const v = String(r[col] ?? "").trim();
    if (v) out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

/**
 * Document column → Paidly field. Each field can be used once; choosing a field already used moves it.
 */
export default function ImportMapStep({ sheets, sheetIdx, onSheetChange, table, mapping, confidence, notes, itemType, onMappingChange, notices }) {
  const fields = PRODUCT_IMPORT_FIELDS.filter((f) => itemType !== "service" || !PRODUCT_ONLY_FIELDS.includes(f.key));
  const nameMapped = mapping.includes("name");
  const needsCheck = mapping.some((f, i) => f !== IGNORE_COLUMN && confidence[i] === "medium");

  const setField = (col, field) => {
    const next = mapping.map((f, i) => (i !== col && f === field && field !== IGNORE_COLUMN ? IGNORE_COLUMN : f));
    next[col] = field;
    onMappingChange(next);
  };

  return (
    <div className="space-y-4">
      {notices?.length ? (
        <ul className="space-y-1.5">
          {notices.map((n) => (
            <li key={n} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      {sheets.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sheet</span>
          <Select value={String(sheetIdx)} onValueChange={(v) => onSheetChange(Number(v))}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((s, i) => (
                <SelectItem key={s.name + i} value={String(i)}>
                  {s.name} ({s.table.rows.length} rows)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {table.rows.length.toLocaleString()} row(s) found. Match each column in your document to a Paidly field
        {needsCheck ? " — columns marked “Check” were matched with less certainty" : ""}. Choose <em>Ignore column</em> for anything you
        don&apos;t need.
      </p>

      {!nameMapped ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Choose which column holds the product name.
        </p>
      ) : null}

      <div className="divide-y rounded-xl border">
        {table.headers.map((header, col) => {
          const field = mapping[col] || IGNORE_COLUMN;
          const conf = field === IGNORE_COLUMN ? "none" : confidence[col];
          return (
            <div key={`${header}-${col}`} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_14rem] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Document column</p>
                <p className="truncate font-medium" title={header}>
                  “{header}”
                </p>
                <p className="truncate text-xs text-muted-foreground">{samplesFor(table, col).join(" · ") || "(empty)"}</p>
                {notes[col] ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{notes[col]}</p> : null}
              </div>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
              <div className="space-y-1">
                <div className="flex items-center justify-between sm:hidden">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Paidly field</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={field} onValueChange={(v) => setField(col, v)}>
                    <SelectTrigger className={cn("h-9", field === IGNORE_COLUMN && "text-muted-foreground")} aria-label={`Paidly field for ${header}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value={IGNORE_COLUMN}>Ignore column</SelectItem>
                    </SelectContent>
                  </Select>
                  {conf === "medium" ? (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Check</span>
                  ) : conf === "high" ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Matched</span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
