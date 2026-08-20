import { useEffect, useRef, useState } from "react";
import {
  createSubscriptionAndRedirect,
  getSubscriptionCheckoutUrls,
  isSubscriptionCheckoutInFlight,
  releaseSubscriptionCheckoutGuard,
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

const PHASE = Object.freeze({
  idle: "idle",
  starting: "starting",
  redirecting: "redirecting",
  error: "error",
});

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
 * 3. Form POST to PayFast (does not wait for ITN).
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
  const [phase, setPhase] = useState(PHASE.idle);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== PHASE.redirecting) return undefined;
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      releaseSubscriptionCheckoutGuard();
      setPhase(PHASE.error);
      setError("We couldn't open the payment page. Please try again.");
      setErrorCode("PAYFAST_REDIRECT_FAILED");
    }, 8000);
    return () => clearTimeout(t);
  }, [phase]);

  const slug = normalizePlanSlug(planSlug || planName);
  const priceLabel =
    displayPriceZar != null && String(displayPriceZar).trim() !== ""
      ? String(displayPriceZar).replace(/^R/i, "")
      : null;

  const busy = phase === PHASE.starting || phase === PHASE.redirecting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || isSubscriptionCheckoutInFlight()) return;

    setError(null);
    setErrorCode(null);

    if (!authUser?.email || !authUser?.id) {
      setPhase(PHASE.error);
      setError("Please sign in to subscribe.");
      setErrorCode("AUTH_REQUIRED");
      return;
    }
    if (!slug) {
      setPhase(PHASE.error);
      setError("Select a valid plan to continue.");
      setErrorCode("VALIDATION_ERROR");
      return;
    }

    setPhase(PHASE.starting);
    try {
      await createSubscriptionAndRedirect({ planSlug: slug });
      if (mountedRef.current) setPhase(PHASE.redirecting);
    } catch (err) {
      if (!mountedRef.current) return;
      setPhase(PHASE.error);
      setError(err?.message || "Unable to start subscription. Please try again.");
      setErrorCode(err?.code || "CHECKOUT_FAILED");
    }
  };

  const handleRetry = () => {
    setError(null);
    setErrorCode(null);
    setPhase(PHASE.idle);
  };

  return (
    <form action="#" method="post" onSubmit={handleSubmit} className={className}>
      {phase === PHASE.error && error ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/40" role="alert">
          <p className="font-semibold text-red-800 dark:text-red-300">Unable to start subscription</p>
          <p className="mt-1 text-red-700 dark:text-red-400">{error}</p>
          {import.meta.env.DEV && errorCode ? (
            <p className="mt-1 font-mono text-[11px] text-red-500/80">{errorCode}</p>
          ) : null}
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 text-sm font-semibold text-red-800 underline-offset-2 hover:underline dark:text-red-200"
          >
            Try again
          </button>
        </div>
      ) : null}

      {submitVariant === "image" ? (
        <button
          type="submit"
          disabled={busy}
          className="w-full flex justify-center disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2 rounded-2xl"
        >
          {busy ? (
            <span className="inline-flex items-center gap-2 py-4 text-sm font-semibold text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              Starting subscription...
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
          disabled={busy}
          className="w-full bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white font-bold py-4 px-6 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2"
        >
          {busy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" aria-hidden />
              Starting subscription...
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
