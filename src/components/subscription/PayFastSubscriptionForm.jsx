import { useState } from "react";
import {
  createSubscriptionAndRedirect,
  getSubscriptionCheckoutUrls,
} from "@/services/subscriptionCheckoutService";
import { normalizePlanSlug } from "@/lib/plans.js";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import PropTypes from "prop-types";

/** Live checkout (PayFast). Override with VITE_PAYFAST_PROCESS_URL if needed. */
const PAYFAST_PROCESS_URL = "https://www.payfast.co.za/eng/process";
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";

const PAYFAST_SUBSCRIBE_IMG =
  "https://my.payfast.io/images/buttons/Subscribe/Light-Large-Subscribe.png";

/**
 * @deprecated Prefer `getSubscriptionCheckoutUrls` from subscriptionCheckoutService.
 * Kept so older imports keep working; notify URL defaults to `/api/payfast/itn`.
 */
export function getPayfastSubscriptionCheckoutUrls() {
  return getSubscriptionCheckoutUrls();
}

/**
 * PayFast subscription UI (billing v2):
 * 1. Continue → POST /api/subscriptions/create (planSlug only — amount from DB).
 * 2. Receive PayFast URL + signed fields.
 * 3. Form POST / window navigation to PayFast.
 * 4. After pay, return page polls GET /api/subscriptions/status until backend reports active.
 *
 * Never sets subscription.status = "active" on the client.
 */
export default function PayFastSubscriptionForm({
  planSlug,
  planName = "Individual",
  displayPriceZar = null,
  itemDescription: _itemDescription = "",
  ctaLabel = "Continue",
  submitVariant = "button",
  processUrl: _processUrl,
  className = "",
  /** @deprecated Ignored — server loads amount from plans catalog. */
  amountZar: _amountZar,
}) {
  const { user: authUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const slug = normalizePlanSlug(planSlug || planName);
  const priceLabel =
    displayPriceZar != null && String(displayPriceZar).trim() !== ""
      ? String(displayPriceZar).replace(/^R/i, "")
      : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!authUser?.email || !authUser?.id) {
      setError("Please sign in to subscribe.");
      return;
    }
    if (!slug) {
      setError("Select a valid plan to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createSubscriptionAndRedirect({ planSlug: slug });
      // Navigation leaves the page; keep spinner if form POST is slow
    } catch (err) {
      setError(err?.message || "Could not start subscription. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form action="#" method="post" onSubmit={handleSubmit} className={className}>
      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {submitVariant === "image" ? (
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2 rounded-2xl"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2 py-4 text-sm font-semibold text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              Loading…
            </span>
          ) : (
            <img
              src={PAYFAST_SUBSCRIBE_IMG}
              alt="Subscribe with Payfast"
              title="Subscribe with Payfast"
              className="h-auto max-w-full mx-auto"
            />
          )}
        </button>
      ) : (
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white font-bold py-4 px-6 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" aria-hidden />
              Loading…
            </>
          ) : (
            <>
              {ctaLabel}
              {priceLabel ? ` (R${priceLabel}/mo)` : ""}
            </>
          )}
        </button>
      )}
    </form>
  );
}

export { PAYFAST_PROCESS_URL, PAYFAST_SANDBOX_URL };

PayFastSubscriptionForm.propTypes = {
  planSlug: PropTypes.string,
  planName: PropTypes.string,
  displayPriceZar: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  amountZar: PropTypes.string,
  itemDescription: PropTypes.string,
  ctaLabel: PropTypes.string,
  submitVariant: PropTypes.oneOf(["button", "image"]),
  processUrl: PropTypes.string,
  className: PropTypes.string,
};
