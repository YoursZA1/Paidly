import { format } from "date-fns";
import { CELEBRATION } from "@shared/ux/doneStates.js";
import { invoicePaymentMethodLabel } from "@shared/payments/invoicePaymentMethods.js";
import { formatCurrency } from "@/utils/currencyCalculations";

/** "12 October 2026", or "" for missing/invalid dates. */
export function longDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : format(d, "d MMMM yyyy");
}

/** Celebration props for DoneState from a payment milestone (see shared/ux/doneStates.js). */
export function paymentMilestoneCelebration(milestone, currency = "ZAR") {
  if (!milestone) return { celebration: CELEBRATION.NONE, celebrationLabel: "" };
  if (milestone.kind === "collected") {
    return {
      celebration: CELEBRATION.MILESTONE,
      celebrationLabel: `${formatCurrency(milestone.threshold, currency, { showDecimals: false })} collected with Paidly`,
    };
  }
  return { celebration: CELEBRATION.STRONG, celebrationLabel: "Your first invoice payment" };
}

export function paymentMethodLabel(method) {
  return invoicePaymentMethodLabel(method);
}
