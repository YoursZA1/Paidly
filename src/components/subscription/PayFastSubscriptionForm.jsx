import { useState } from "react";
import { createPageUrl } from "@/utils";
import PayfastService from "@/services/PayfastService";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import PropTypes from "prop-types";

const PAYFAST_PROCESS_URL = "https://www.payfast.co.za/eng/process";
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";

const DEFAULT_AMOUNT_ZAR = "199.00";
const SUBSCRIPTION_TYPE = "1";
const FREQUENCY_MONTHLY = "3";
const CYCLES_INFINITE = "0";

/**
 * Builds the full Settings page URL for return/cancel (same as app Settings route).
 */
function getSettingsReturnUrl() {
  const path = createPageUrl("Settings");
  return `${window.location.origin}${path}`;
}

/**
 * PayFast Subscription form: posts to PayFast process URL with subscription_type (1),
 * frequency (3 = monthly), monthly amount in ZAR, and return/cancel URLs pointing to /Settings.
 * Uses backend to get signed payload, then submits form to PayFast.
 */
export default function PayFastSubscriptionForm({
  amountZar = DEFAULT_AMOUNT_ZAR,
  planName = "Paidly Pro Monthly",
  ctaLabel = "Upgrade to Pro",
  processUrl,
  className = "",
}) {
  const { user: authUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const returnUrl = getSettingsReturnUrl();
  const cancelUrl = getSettingsReturnUrl();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const userEmail = authUser?.email;
    const userName = authUser?.full_name || authUser?.user_metadata?.full_name || authUser?.email || "Customer";

    if (!userEmail) {
      setError("Please sign in to subscribe.");
      return;
    }

    setIsSubmitting(true);
    try {
      await PayfastService.startSubscription({
        subscriptionId: `paidly-pro-${authUser?.id || Date.now()}`,
        userId: authUser?.id || "",
        userEmail,
        userName,
        plan: planName,
        billingCycle: "monthly",
        amount: parseFloat(amountZar) || 199,
        currency: "ZAR",
        returnPath: createPageUrl("Settings"),
        cancelPath: createPageUrl("Settings"),
      });
    } catch (err) {
      setError(err?.message || "Could not start subscription. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form
      action={processUrl || PAYFAST_PROCESS_URL}
      method="post"
      onSubmit={handleSubmit}
      className={className}
    >
      {/* Hidden fields for PayFast subscription (full signed payload from API on submit) */}
      <input type="hidden" name="subscription_type" value={SUBSCRIPTION_TYPE} />
      <input type="hidden" name="frequency" value={FREQUENCY_MONTHLY} />
      <input type="hidden" name="cycles" value={CYCLES_INFINITE} />
      <input type="hidden" name="amount" value={amountZar} />
      <input type="hidden" name="item_name" value={planName} />
      <input type="hidden" name="return_url" value={returnUrl} />
      <input type="hidden" name="cancel_url" value={cancelUrl} />

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white font-bold py-4 px-6 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" aria-hidden />
            Redirecting to PayFast…
          </>
        ) : (
          <>{ctaLabel} (R{amountZar}/mo)</>
        )}
      </button>
    </form>
  );
}

export { getSettingsReturnUrl, PAYFAST_PROCESS_URL, PAYFAST_SANDBOX_URL };

PayFastSubscriptionForm.propTypes = {
  amountZar: PropTypes.string,
  planName: PropTypes.string,
  ctaLabel: PropTypes.string,
  processUrl: PropTypes.string,
  className: PropTypes.string,
};
