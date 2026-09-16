/**
 * LEGACY: PayFast one-time invoice ITN settlement.
 * DISABLED — customer invoice money must settle via Payment Engine (Ozow Notify).
 * Kept exported so callers fail closed if invoked.
 *
 * SaaS subscription PayFast ITN lives in billing/payfastItnPipeline.js (untouched).
 */
export async function processPayfastInvoiceItn(_supabase, _payload) {
  const err = new Error(
    "Legacy PayFast customer invoice settlement is disabled. Use Payment Engine (Ozow)."
  );
  err.code = "CUSTOMER_PAYFAST_DISABLED";
  throw err;
}
