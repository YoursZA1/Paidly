export const EXPENSE_CATEGORIES = Object.freeze([
  { key: "travel", label: "Travel" },
  { key: "meals", label: "Meals & entertainment" },
  { key: "supplies", label: "Office supplies" },
  { key: "software", label: "Software & subscriptions" },
  { key: "mileage", label: "Mileage" },
  { key: "other", label: "Other" },
]);

export const REIMBURSEMENT_METHODS = Object.freeze([
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "payroll", label: "Add to next payroll" },
  { key: "petty_cash", label: "Petty cash" },
]);

const CATEGORY_LABELS = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, c.label]));
const METHOD_LABELS = new Map(REIMBURSEMENT_METHODS.map((m) => [m.key, m.label]));

/** @returns {{ id: string, expense_date: string, category: string, description: string, amount: string, receipt_ref: string }} */
export function emptyExpenseLine() {
  return {
    id: crypto.randomUUID(),
    expense_date: "",
    category: "travel",
    description: "",
    amount: "",
    receipt_ref: "",
  };
}

/** @param {unknown} key */
export function expenseCategoryLabel(key) {
  return CATEGORY_LABELS.get(String(key || "")) || "Expense";
}

/** @param {unknown} key */
export function reimbursementMethodLabel(key) {
  return METHOD_LABELS.get(String(key || "")) || "Reimbursement";
}

/** @param {Array<{ amount?: string | number }>} lines */
export function sumExpenseLineAmounts(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((sum, line) => {
    const n = Number(line?.amount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** @param {Array<{ expense_date?: string, category?: string, description?: string, amount?: string | number, receipt_ref?: string, id?: string }>} lines */
export function expenseLinesToDocumentItems(lines) {
  return (lines || [])
    .filter((line) => {
      const amount = Number(line?.amount);
      return Number.isFinite(amount) && amount > 0;
    })
    .map((line) => {
      const amount = Math.round(Number(line.amount) * 100) / 100;
      const category = expenseCategoryLabel(line.category);
      const desc = String(line.description || "").trim();
      const date = line.expense_date ? ` (${line.expense_date})` : "";
      const receipt = line.receipt_ref ? ` · Ref: ${line.receipt_ref}` : "";
      return {
        description: `${category}${date}${desc ? ` — ${desc}` : ""}${receipt}`,
        quantity: 1,
        unit_price: amount,
      };
    });
}
