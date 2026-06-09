import { useMemo } from "react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/currencyCalculations";
import {
  EXPENSE_CATEGORIES,
  REIMBURSEMENT_METHODS,
  emptyExpenseLine,
  sumExpenseLineAmounts,
  expenseCategoryLabel,
  reimbursementMethodLabel,
} from "@/document-engine/expenseClaim";

/**
 * Shared expense-claim form (create page + document detail).
 *
 * @param {{
 *   lines: Array<{ id: string, expense_date: string, category: string, description: string, amount: string, receipt_ref: string }>,
 *   onLinesChange?: (lines: Array) => void,
 *   reimbursementMethod?: string,
 *   onReimbursementMethodChange?: (value: string) => void,
 *   notes?: string,
 *   onNotesChange?: (value: string) => void,
 *   currency?: string,
 *   readOnly?: boolean,
 *   showSummary?: boolean,
 *   className?: string,
 * }} props
 */
export default function ExpenseClaimFields({
  lines,
  onLinesChange,
  reimbursementMethod = "bank_transfer",
  onReimbursementMethodChange,
  notes = "",
  onNotesChange,
  currency = "ZAR",
  readOnly = false,
  showSummary = true,
  className,
}) {
  const total = useMemo(() => sumExpenseLineAmounts(lines), [lines]);
  const lineCount = lines.filter((l) => Number(l.amount) > 0).length;

  const updateLine = (id, patch) => {
    if (readOnly || !onLinesChange) return;
    onLinesChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const addLine = () => {
    if (readOnly || !onLinesChange) return;
    onLinesChange([...lines, emptyExpenseLine()]);
  };

  const removeLine = (id) => {
    if (readOnly || !onLinesChange) return;
    const next = lines.filter((line) => line.id !== id);
    onLinesChange(next.length ? next : [emptyExpenseLine()]);
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Expense lines</Label>
            <p className="text-sm text-muted-foreground">
              Add each receipt or expense with date, category, and amount.
            </p>
          </div>
          {!readOnly ? (
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              Add expense
            </Button>
          ) : null}
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Expense {index + 1}</p>
                {!readOnly && lines.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={`expense-date-${line.id}`}>Date</Label>
                  {readOnly ? (
                    <p className="text-sm">{line.expense_date || "—"}</p>
                  ) : (
                    <Input
                      id={`expense-date-${line.id}`}
                      type="date"
                      value={line.expense_date}
                      onChange={(e) => updateLine(line.id, { expense_date: e.target.value })}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`expense-category-${line.id}`}>Category</Label>
                  {readOnly ? (
                    <p className="text-sm">{expenseCategoryLabel(line.category)}</p>
                  ) : (
                    <Select
                      value={line.category}
                      onValueChange={(v) => updateLine(line.id, { category: v })}
                    >
                      <SelectTrigger id={`expense-category-${line.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor={`expense-amount-${line.id}`}>Amount</Label>
                  {readOnly ? (
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(Number(line.amount) || 0, currency)}
                    </p>
                  ) : (
                    <Input
                      id={`expense-amount-${line.id}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.amount}
                      onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                    />
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`expense-desc-${line.id}`}>Description</Label>
                  {readOnly ? (
                    <p className="text-sm">{line.description?.trim() || "—"}</p>
                  ) : (
                    <Input
                      id={`expense-desc-${line.id}`}
                      value={line.description}
                      onChange={(e) => updateLine(line.id, { description: e.target.value })}
                      placeholder="What was this expense for?"
                    />
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`expense-ref-${line.id}`}>Receipt reference</Label>
                  {readOnly ? (
                    <p className="text-sm">{line.receipt_ref?.trim() || "—"}</p>
                  ) : (
                    <Input
                      id={`expense-ref-${line.id}`}
                      value={line.receipt_ref}
                      onChange={(e) => updateLine(line.id, { receipt_ref: e.target.value })}
                      placeholder="Invoice #, receipt ID, or file name"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reimbursement-method">Reimbursement method</Label>
          {readOnly ? (
            <p id="reimbursement-method" className="text-sm font-medium">
              {reimbursementMethodLabel(reimbursementMethod)}
            </p>
          ) : (
            <Select value={reimbursementMethod} onValueChange={onReimbursementMethodChange}>
              <SelectTrigger id="reimbursement-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REIMBURSEMENT_METHODS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expense-notes">Notes for approver</Label>
        {readOnly ? (
          <p id="expense-notes" className="whitespace-pre-wrap text-sm">
            {notes?.trim() ? notes : "—"}
          </p>
        ) : (
          <Textarea
            id="expense-notes"
            value={notes}
            onChange={(e) => onNotesChange?.(e.target.value)}
            placeholder="Trip context, policy exceptions, or other details…"
            className="min-h-[90px]"
          />
        )}
      </div>

      {showSummary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Claim summary</CardTitle>
            <CardDescription>Total reimbursable amount for this submission.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-xl font-semibold tabular-nums">{lineCount || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total claim</p>
              <p className="text-xl font-semibold tabular-nums">
                {total > 0 ? formatCurrency(total, currency) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** @param {unknown} metadata */
export function expenseClaimDataFromMetadata(metadata) {
  const claim = metadata && typeof metadata === "object" ? metadata.expense_claim : null;
  if (!claim || typeof claim !== "object") return null;
  return claim;
}

/** @param {unknown} metadata */
export function expenseClaimFormStateFromMetadata(metadata) {
  const claim = expenseClaimDataFromMetadata(metadata);
  if (!claim) {
    return {
      lines: [emptyExpenseLine()],
      reimbursementMethod: "bank_transfer",
      notes: "",
      currency: "ZAR",
    };
  }
  const lines = Array.isArray(claim.lines) && claim.lines.length
    ? claim.lines.map((line) => ({
        id: line.id || crypto.randomUUID(),
        expense_date: line.expense_date || "",
        category: line.category || "travel",
        description: line.description || "",
        amount: line.amount != null ? String(line.amount) : "",
        receipt_ref: line.receipt_ref || "",
      }))
    : [emptyExpenseLine()];
  return {
    lines,
    reimbursementMethod: claim.reimbursement_method || "bank_transfer",
    notes: claim.notes || "",
    currency: claim.currency || "ZAR",
  };
}

/** @param {{ lines: Array, reimbursementMethod?: string, notes?: string, currency?: string }} form */
export function expenseClaimMetadataFromForm(form) {
  const total = sumExpenseLineAmounts(form.lines);
  return {
    expense_claim: {
      lines: (form.lines || []).map((line) => ({
        id: line.id,
        expense_date: line.expense_date || null,
        category: line.category || "travel",
        description: line.description?.trim() || null,
        amount: Number(line.amount) || 0,
        receipt_ref: line.receipt_ref?.trim() || null,
      })),
      total_amount: Math.round(total * 100) / 100,
      currency: form.currency || "ZAR",
      reimbursement_method: form.reimbursementMethod || "bank_transfer",
      notes: form.notes?.trim() || null,
      submitted_at: format(new Date(), "yyyy-MM-dd"),
    },
  };
}
