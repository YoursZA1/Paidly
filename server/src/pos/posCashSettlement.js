import { computeCashChange, roundMoney } from "./posCheckoutMath.js";

/** Till cash is cashier-verified. It is not an online payment provider. */
export const TILL_CASH_SETTLEMENT = "till";

/**
 * @param {number} total due
 * @param {number|string} amountTendered customer cash
 * @returns {{ ok: true, amountTendered: number, changeDue: number, total: number } | { ok: false, error: string, code: string }}
 */
export function settleTillCash(total, amountTendered) {
  const due = roundMoney(total);
  const result = computeCashChange(due, amountTendered);
  if (!result.ok) {
    return { ok: false, error: result.error, code: "CASH_TENDER_INVALID" };
  }
  return {
    ok: true,
    total: due,
    amountTendered: result.amountTendered,
    changeDue: result.changeDue,
    settlement: TILL_CASH_SETTLEMENT,
  };
}

export function tillCashIntentMetadata(existing, settled) {
  const prev = existing && typeof existing === "object" ? existing : {};
  return {
    ...prev,
    settlement: TILL_CASH_SETTLEMENT,
    payment_method: "cash",
    amount_tendered: settled.amountTendered,
    change_due: settled.changeDue,
    code: null,
    last_error: null,
    next_action: null,
  };
}
