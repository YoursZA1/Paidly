import { CUSTOMER_PAYMENT_PROVIDERS } from "../paymentIntentContract.js";

/**
 * First intended digital customer rail (instant EFT). Not a physical card terminal.
 * Do not call Ozow until merchant credentials and API contract are in this repo.
 */
export function ozowCredentialsPresent(env = process.env) {
  const site = String(env.OZOW_SITE_CODE || "").trim();
  const apiKey = String(env.OZOW_API_KEY || "").trim();
  const privateKey = String(env.OZOW_PRIVATE_KEY || "").trim();
  return Boolean(site && apiKey && privateKey);
}

export const ozowProvider = {
  id: CUSTOMER_PAYMENT_PROVIDERS.OZOW,
  sourceKinds: ["pos", "document"],
  isConfigured() {
    return ozowCredentialsPresent();
  },
  async createCharge(intent) {
    if (!ozowCredentialsPresent()) {
      return {
        status: "failed",
        code: "PROVIDER_NOT_CONFIGURED",
        error:
          "Ozow is the digital payment rail, but merchant credentials are not configured. The sale was not completed.",
      };
    }
    return {
      status: "requires_action",
      code: "PROVIDER_NOT_IMPLEMENTED",
      error:
        "Ozow credentials are present, but the charge API is not wired yet. The sale was not completed.",
      next_action: null,
      external_id: intent.external_id || null,
    };
  },
  async handleWebhook() {
    return {
      ok: false,
      code: "PROVIDER_NOT_IMPLEMENTED",
      error: "Ozow webhook verification is not wired yet.",
    };
  },
};
