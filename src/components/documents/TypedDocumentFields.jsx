import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currencyCalculations";
import {
  RATING_SCALE,
  parseChecklistField,
  serializeChecklistField,
  parseRatingMatrixField,
  serializeRatingMatrixField,
  ratingLabel,
  checklistProgress,
  emptyChecklistItem,
} from "@/document-engine/documentFormRichFields";

function emptyLine() {
  return { _key: crypto.randomUUID(), description: "", quantity: "1", unit_price: "" };
}

function fieldSpansFullWidth(type) {
  return type === "textarea" || type === "rating_matrix" || type === "checklist" || type === "rating";
}

function RatingScaleControl({ value, onChange, readOnly, id }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={id}>
        {RATING_SCALE.map((step) => {
          const selected = String(value) === step.value;
          if (readOnly) {
            return selected ? (
              <span
                key={step.value}
                className="inline-flex rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium"
              >
                {step.label} — {step.description}
              </span>
            ) : null;
          }
          return (
            <Button
              key={step.value}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className="h-auto min-w-[2.5rem] flex-col gap-0.5 px-3 py-2"
              onClick={() => onChange?.(step.value)}
              aria-pressed={selected}
            >
              <span className="text-base font-semibold">{step.label}</span>
              <span className="text-[10px] font-normal leading-tight opacity-80">{step.description}</span>
            </Button>
          );
        })}
      </div>
      {readOnly && !value ? <p className="text-sm text-muted-foreground">—</p> : null}
    </div>
  );
}

function RatingMatrixControl({ field, value, onChange, readOnly }) {
  const matrix = parseRatingMatrixField(value);
  const competencies = field.competencies || [];

  const setRating = (compKey, rating) => {
    if (readOnly || !onChange) return;
    onChange(serializeRatingMatrixField({ ...matrix, [compKey]: rating }));
  };

  const rated = competencies.filter((c) => matrix[c.key]).length;
  const average =
    rated > 0
      ? (
          competencies.reduce((sum, c) => sum + (Number(matrix[c.key]) || 0), 0) / rated
        ).toFixed(1)
      : null;

  return (
    <div className="space-y-3">
      {competencies.map((comp) => (
        <div key={comp.key} className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-sm font-medium">{comp.label}</p>
          <RatingScaleControl
            value={matrix[comp.key] || ""}
            onChange={(v) => setRating(comp.key, v)}
            readOnly={readOnly}
            id={`rating-${comp.key}`}
          />
        </div>
      ))}
      {average ? (
        <p className="text-sm text-muted-foreground">
          Average competency rating: <span className="font-medium text-foreground">{average} / 5</span>
        </p>
      ) : null}
    </div>
  );
}

function ChecklistControl({ field, value, onChange, readOnly }) {
  const items = parseChecklistField(value);
  const { done, total } = checklistProgress(items);
  const progress = total ? Math.round((done / total) * 100) : 0;

  const commit = (next) => {
    if (readOnly || !onChange) return;
    onChange(serializeChecklistField(next));
  };

  const toggleItem = (id, checked) => {
    commit(items.map((item) => (item.id === id ? { ...item, checked } : item)));
  };

  const updateItem = (id, patch) => {
    commit(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    commit([...items, emptyChecklistItem("")]);
  };

  const removeItem = (id) => {
    const next = items.filter((item) => item.id !== id);
    commit(next.length ? next : [emptyChecklistItem("")]);
  };

  return (
    <div className="space-y-3">
      {total > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {done} of {total} complete
            </span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex gap-3 rounded-lg border border-border p-3",
              item.checked && "bg-muted/30"
            )}
          >
            <Checkbox
              id={`check-${item.id}`}
              checked={item.checked}
              disabled={readOnly}
              onCheckedChange={(checked) => toggleItem(item.id, checked === true)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1 space-y-2">
              {readOnly ? (
                <label
                  htmlFor={`check-${item.id}`}
                  className={cn(
                    "block text-sm font-medium",
                    item.checked && "text-muted-foreground line-through"
                  )}
                >
                  {item.label || "—"}
                </label>
              ) : (
                <Input
                  value={item.label}
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                  placeholder="Checklist item…"
                  className={cn(item.checked && "text-muted-foreground line-through")}
                />
              )}
              {readOnly ? (
                item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null
              ) : (
                <Input
                  value={item.note || ""}
                  onChange={(e) => updateItem(item.id, { note: e.target.value })}
                  placeholder="Optional note"
                  className="text-sm"
                />
              )}
            </div>
            {!readOnly && items.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.id)}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          Add item
        </Button>
      ) : null}
    </div>
  );
}

function renderReadOnlyValue(field, values) {
  const raw = values?.[field.key];
  if (field.type === "rating") return ratingLabel(raw);
  if (field.type === "rating_matrix") {
    const matrix = parseRatingMatrixField(raw);
    const lines = (field.competencies || [])
      .filter((c) => matrix[c.key])
      .map((c) => `${c.label}: ${ratingLabel(matrix[c.key])}`);
    return lines.length ? lines.join("\n") : "—";
  }
  if (field.type === "checklist") {
    const items = parseChecklistField(raw);
    return items.length
      ? items.map((item) => `${item.checked ? "✓" : "○"} ${item.label}`).join("\n")
      : "—";
  }
  return String(raw ?? "").trim() || "—";
}

/**
 * Renders a document form profile (metadata.form fields + optional line items).
 */
export default function TypedDocumentFields({
  profile,
  values,
  onChange,
  lines = [],
  onLinesChange,
  currency = "ZAR",
  readOnly = false,
  className,
}) {
  const setField = (key, value) => {
    if (!readOnly && onChange) onChange(key, value);
  };

  const updateLine = (key, patch) => {
    if (readOnly || !onLinesChange) return;
    onLinesChange(lines.map((line) => (line._key === key ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    if (readOnly || !onLinesChange) return;
    onLinesChange([...lines, emptyLine()]);
  };

  const removeLine = (key) => {
    if (readOnly || !onLinesChange) return;
    const next = lines.filter((line) => line._key !== key);
    onLinesChange(next.length ? next : [emptyLine()]);
  };

  const lineTotal = lines.reduce((sum, line) => {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unit_price) || 0;
    return sum + qty * unit;
  }, 0);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {(profile.fields || []).map((field) => (
          <div
            key={field.key}
            className={cn("space-y-2", fieldSpansFullWidth(field.type) && "sm:col-span-2")}
          >
            <Label htmlFor={`form-${field.key}`}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>

            {readOnly &&
            field.type !== "rating" &&
            field.type !== "rating_matrix" &&
            field.type !== "checklist" ? (
              <p id={`form-${field.key}`} className="whitespace-pre-wrap text-sm">
                {renderReadOnlyValue(field, values)}
              </p>
            ) : field.type === "rating" ? (
              <RatingScaleControl
                id={`form-${field.key}`}
                value={values?.[field.key] ?? ""}
                onChange={(v) => setField(field.key, v)}
                readOnly={readOnly}
              />
            ) : field.type === "rating_matrix" ? (
              readOnly ? (
                <p className="whitespace-pre-wrap text-sm">{renderReadOnlyValue(field, values)}</p>
              ) : (
                <RatingMatrixControl
                  field={field}
                  value={values?.[field.key]}
                  onChange={(v) => setField(field.key, v)}
                  readOnly={readOnly}
                />
              )
            ) : field.type === "checklist" ? (
              <ChecklistControl
                field={field}
                value={values?.[field.key]}
                onChange={(v) => setField(field.key, v)}
                readOnly={readOnly}
              />
            ) : field.type === "textarea" ? (
              <Textarea
                id={`form-${field.key}`}
                rows={field.rows || 4}
                placeholder={field.placeholder}
                value={values?.[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                readOnly={readOnly}
              />
            ) : field.type === "select" ? (
              readOnly ? (
                <p className="text-sm">
                  {(field.options || []).find((o) => o.value === values?.[field.key])?.label || "—"}
                </p>
              ) : (
                <Select value={values?.[field.key] ?? ""} onValueChange={(v) => setField(field.key, v)}>
                  <SelectTrigger id={`form-${field.key}`}>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : (
              <Input
                id={`form-${field.key}`}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                inputMode={field.type === "number" ? "decimal" : undefined}
                placeholder={field.placeholder}
                value={values?.[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                readOnly={readOnly}
              />
            )}
          </div>
        ))}
      </div>

      {profile.includeLineItems ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Line items</Label>
              <p className="text-sm text-muted-foreground">Quantity × unit price.</p>
            </div>
            {!readOnly ? (
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                Add line
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            {lines.map((line) => (
              <div
                key={line._key}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_88px_112px_auto]"
              >
                {readOnly ? (
                  <>
                    <p className="text-sm">{line.description || "—"}</p>
                    <p className="text-sm tabular-nums">{line.quantity}</p>
                    <p className="text-sm tabular-nums">
                      {formatCurrency(Number(line.unit_price) || 0, currency)}
                    </p>
                  </>
                ) : (
                  <>
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => updateLine(line._key, { description: e.target.value })}
                    />
                    <Input
                      inputMode="decimal"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(line._key, { quantity: e.target.value })}
                    />
                    <Input
                      inputMode="decimal"
                      placeholder="Unit price"
                      value={line.unit_price}
                      onChange={(e) => updateLine(line._key, { unit_price: e.target.value })}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line._key)}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          {lineTotal > 0 ? (
            <p className="text-right text-sm font-medium tabular-nums">
              Total: {formatCurrency(lineTotal, currency)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { emptyLine as emptyTypedDocumentLine };

export function typedLinesToDocumentItems(lines) {
  return (lines || [])
    .filter((line) => line.description?.trim() || Number(line.unit_price) > 0)
    .map((line, index) => ({
      description: line.description?.trim() || "Line item",
      quantity: Number(line.quantity) || 1,
      unit_price: Number(line.unit_price) || 0,
      line_order: index,
    }));
}

export function documentItemsToTypedLines(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return [emptyLine()];
  return rows.map((row) => ({
    _key: row.id || crypto.randomUUID(),
    description: row.description ?? "",
    quantity: String(row.quantity ?? 1),
    unit_price: String(row.unit_price ?? 0),
  }));
}
