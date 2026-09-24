import { CUSTOMER_PAYMENT_PROVIDERS } from "../paymentIntentContract.js";
import {
  cardTerminalRailEnabled,
  isMockPaymentsEnabled,
  paidlyPayOpenUrl,
  resolvePaidlyPayOrigin,
} from "../../../../shared/payments/paidlyPayContract.js";

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
    return cardTerminalRailEnabled();
  },
  async createCharge(intent, chargeCtx = {}) {
    const rail = chargeCtx.cardRail || intent.metadata?.card_rail || {};
    const railId = String(rail.id || "paidly_pay").trim().toLowerCase();
    const railLabel = String(rail.label || (railId === "yoco" ? "Yoco" : railId === "square" ? "Square" : "Paidly Pay")).trim();
    const method = String(chargeCtx.paymentMethod || intent.metadata?.paidly_pay_method || intent.metadata?.payment_method || "card")
      .trim()
      .toLowerCase();
    const qr = method === "qr";
    const mock = isMockPaymentsEnabled();
    const reader = railId === "yoco" || railId === "square";
    const origin = chargeCtx.appOrigin || resolvePaidlyPayOrigin();
    const payMethod = qr ? "qr" : "tap_to_pay";
    const openUrl = reader ? null : paidlyPayOpenUrl(intent?.id, { origin, method: payMethod });
    return {
      status: "requires_action",
      code: mock ? "MOCK_TERMINAL" : reader ? "READER_ACTION_REQUIRED" : "TERMINAL_ACTION_REQUIRED",
      error: mock
        ? "Mock terminal is waiting for a signed webhook. The sale is not paid yet."
        : reader
          ? `Complete this amount on the connected ${railLabel} reader. The sale is not paid until that rail confirms.`
          : "Present the card or QR on Paidly Pay. The sale is not paid until a verified webhook arrives.",
      next_action: {
        type: reader ? "reader" : qr ? "qr" : "tap_to_pay",
        display: reader ? `Complete on ${railLabel}` : qr ? "QR PAY" : "TAP CARD",
        provider: railId,
        device_name: rail.device_name || null,
        payment_intent_id: intent?.id || null,
        open_url: openUrl,
        qr_payload: qr ? openUrl : null,
        mock,
      },
    };
  },
};
