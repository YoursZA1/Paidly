import { useState } from "react";
import { createPageUrl } from "@/utils";
import PayfastService from "@/services/PayfastService";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import PropTypes from "prop-types";

/** Live checkout (PayFast). Override with VITE_PAYFAST_PROCESS_URL if needed. */
const PAYFAST_PROCESS_URL = "https://www.payfast.co.za/eng/process";
const PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process";

/** Default matches Individual tier (Settings → Subscription); SME R50 / Corporate R110 pass `amountZar` explicitly. */
const DEFAULT_AMOUNT_ZAR = "25.00";

const PAYFAST_SUBSCRIBE_IMG =
  "https://my.payfast.io/images/buttons/Subscribe/Light-Large-Subscribe.png";

function paidlyPublicSiteBase() {
  const fromEnv = (import.meta.env.VITE_PAYFAST_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://www.paidly.co.za";
}

/**
 * Return/cancel URLs: default success path /success (also /return). Override with VITE_PAYFAST_*.
 */
export function getPayfastSubscriptionCheckoutUrls() {
  const site = paidlyPublicSiteBase();
  const fromEnv = (import.meta.env.VITE_PAYFAST_SUBSCRIPTION_NOTIFY_URL || "").trim();
  return {
    returnUrl: (import.meta.env.VITE_PAYFAST_RETURN_URL || `${site}/success`).replace(/\/$/, ""),
    cancelUrl: (import.meta.env.VITE_PAYFAST_CANCEL_URL || `${site}/cancel`).replace(/\/$/, ""),
    notifyUrl: fromEnv || `${site}/api/payfast/webhook`,
  };
}

/**
 * Builds the full Settings page URL (legacy fallback).
 */
function getSettingsReturnUrl() {
  const path = createPageUrl("Settings");
  return `${window.location.origin}${path}`;
}

/**
 * PayFast subscription UI (clean flow):
 * 1. User submits → `PayfastService.startSubscription` POSTs JSON to `/api/payfast/subscription`.
 * 2–3. Backend returns `{ payfastUrl, fields }`.
 * 4. Service builds a hidden form and POSTs `fields` to PayFast (`payfastUrl`).
 *
 * This visible `<form>` only captures submit; it does not post unsigned data to PayFast (`action="#"`).
 * Tiers: Individual R25, SME R50, Corporate R110 (`SubscriptionSettings` passes `amountZar`).
 */
export default function PayFastSubscriptionForm({
  amountZar = DEFAULT_AMOUNT_ZAR,
  planName = "Individual",
  itemDescription = "",
  ctaLabel = "Subscribe",
  submitVariant = "button",
  processUrl: _processUrl,
  className = "",
}) {
  const { user: authUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { returnUrl, cancelUrl, notifyUrl } = getPayfastSubscriptionCheckoutUrls();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const userEmail = authUser?.email;
    const userName = authUser?.full_name || authUser?.user_metadata?.full_name || authUser?.email || "Customer";

    if (!userEmail) {
      setError("Please sign in to subscribe.");
      return;
    }
    if (!authUser?.id) {
      setError("Your session is missing a user id. Sign out and sign in again, then try subscribing.");
      return;
    }

    setIsSubmitting(true);
    try {
      await PayfastService.startSubscription({
        subscriptionId: `paidly-${planName.toLowerCase().replace(/\s+/g, "-")}-${authUser?.id || Date.now()}`,
        userId: authUser?.id || "",
        userEmail,
        userName,
        plan: planName,
        itemDescription: itemDescription || undefined,
        billingCycle: "monthly",
        amount: parseFloat(amountZar) || 0,
        currency: "ZAR",
        returnUrl: returnUrl || getSettingsReturnUrl(),
        cancelUrl: cancelUrl || getSettingsReturnUrl(),
        notifyUrl,
      });
    } catch (err) {
      setError(err?.message || "Could not start subscription. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <form
      action="#"
      method="post"
      onSubmit={handleSubmit}
      className={className}
    >
      {/* Signed checkout: handler calls API then programmatic POST to PayFast; `processUrl` is unused (legacy prop). */}
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
              Redirecting to PayFast…
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
              Redirecting to PayFast…
            </>
          ) : (
            <>
              {ctaLabel} (R{amountZar}/mo)
            </>
          )}
        </button>
      )}
    </form>
  );
}

export { PAYFAST_PROCESS_URL, PAYFAST_SANDBOX_URL };

PayFastSubscriptionForm.propTypes = {
  amountZar: PropTypes.string,
  planName: PropTypes.string,
  itemDescription: PropTypes.string,
  ctaLabel: PropTypes.string,
  submitVariant: PropTypes.oneOf(["button", "image"]),
  processUrl: PropTypes.string,
  className: PropTypes.string,
};
