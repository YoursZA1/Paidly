import { CUSTOMER_PAYMENT_PROVIDERS } from "../paymentIntentContract.js";

/**
 * Physical card-present terminal on the native till.
 * There is no Paidly card-machine SDK. Do not return `paid` from a cashier click.
 * External Yoco/Square hardware confirms through POS webhooks, not this provider.
 */
export const cardTerminalProvider = {
  id: CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL,
  sourceKinds: ["pos"],
  kind: "terminal",
  isConfigured() {
    return false;
  },
  async createCharge() {
    return {
      status: "requires_action",
      code: "TERMINAL_NOT_CONNECTED",
      error:
        "No card terminal is connected to this till. The sale was not marked paid. Use Cash, Digital Payment (Ozow), or a connected Yoco/Square reader that confirms via webhook.",
      next_action: null,
    };
  },
};
