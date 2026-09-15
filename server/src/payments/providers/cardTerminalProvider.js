import { CUSTOMER_PAYMENT_PROVIDERS } from "../paymentIntentContract.js";
import { isMockPaymentsEnabled } from "../../../../shared/payments/paidlyPayContract.js";

/**
 * Physical card-present terminal on the native till / Paidly Pay.
 * Never returns `paid` from a cashier click or mobile client flag.
 * Paid is only applied after a verified webhook (`terminal_confirmed`).
 */
export const cardTerminalProvider = {
  id: CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL,
  sourceKinds: ["pos"],
  kind: "terminal",
  isConfigured() {
    return isMockPaymentsEnabled() || Boolean(String(process.env.POS_WEBHOOK_SECRET || "").trim());
  },
  async createCharge(intent, chargeCtx = {}) {
    const method = String(chargeCtx.paymentMethod || intent.metadata?.paidly_pay_method || intent.metadata?.payment_method || "card")
      .trim()
      .toLowerCase();
    const qr = method === "qr";
    const mock = isMockPaymentsEnabled();
    return {
      status: "requires_action",
      code: mock ? "MOCK_TERMINAL" : "TERMINAL_ACTION_REQUIRED",
      error: mock
        ? "Mock terminal is waiting for a signed webhook. The sale is not paid yet."
        : "Present the card or QR on Paidly Pay. The sale is not paid until a verified webhook arrives.",
      next_action: {
        type: qr ? "qr" : "tap_to_pay",
        display: qr ? "QR PAY" : "TAP CARD",
        mock,
      },
    };
  },
};
