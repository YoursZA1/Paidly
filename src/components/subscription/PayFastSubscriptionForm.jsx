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

const PHASE = Object.freeze({
  idle: "idle",
  starting: "starting",
  redirecting: "redirecting",
  error: "error",
});

/** Last-resort UI recovery if PayFast never unloads this page. Do not use a short timeout:
 *  the SPA stays mounted until PayFast answers the POST (often >8s on mobile). */
const HANDOFF_STILL_HERE_MS = 60_000;

/**
 * @deprecated Prefer `getSubscriptionCheckoutUrls` from subscriptionCheckoutService.
 * Kept so older imports keep working; notify URL defaults to `/api/payfast/itn`.
 */
export function getPayfastSubscriptionCheckoutUrls() {
  return getSubscriptionCheckoutUrls();
}

function buttonLabel(phase, ctaLabel) {
  if (phase === PHASE.starting) return "Starting checkout...";
  if (phase === PHASE.redirecting) return "Redirecting to PayFast...";
  if (phase === PHASE.error) return "Try again";
  return ctaLabel;
}

/**
 * PayFast subscription UI (billing v2):
 * 1. Subscribe → POST /api/subscriptions/create (planSlug only — amount from DB).
 * 2. Receive PayFast URL + signed fields (same payload on every device).
 * 3. Same-window form POST to PayFast (no popup, no iframe).
 *
 * Never sets subscription.status = "active" on the client.
 */
export default function PayFastSubscriptionForm({
  planSlug,
  planName = "Individual",
  displayPriceZar = null,
  itemDescription: _itemDescription = "",
  ctaLabel = "Subscribe",
  submitVariant: _submitVariant = "button",
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      releaseSubscriptionCheckoutGuard();
      setPhase(PHASE.error);
      setError("We couldn't open the PayFast payment page. Please try again.");
      setErrorCode("PAYFAST_REDIRECT_FAILED");
    }, HANDOFF_STILL_HERE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const slug = normalizePlanSlug(planSlug || planName);
  const priceLabel =
    displayPriceZar != null && String(displayPriceZar).trim() !== ""
      ? String(displayPriceZar).replace(/^R/i, "")
      : null;

  const busy = phase === PHASE.starting || phase === PHASE.redirecting;
  const isHandoffError = errorCode === "PAYFAST_REDIRECT_FAILED";
  const isAuthError = errorCode === "AUTH_REQUIRED";

  const handleStart = async () => {
    if (busy || isSubscriptionCheckoutInFlight()) return;

    setError(null);
    setErrorCode(null);

    if (!authUser?.email || !authUser?.id) {
      setPhase(PHASE.error);
      setError("Your session has expired. Please sign in again.");
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
      if (!mountedRef.current) return;
      // Form POST does not unload this page until PayFast responds. Stay on redirecting.
      setPhase(PHASE.redirecting);
    } catch (err) {
      if (!mountedRef.current) return;
      setPhase(PHASE.error);
      const code = err?.code || "CHECKOUT_FAILED";
      setErrorCode(code);
      if (code === "PAYFAST_REDIRECT_FAILED") {
        setError("We couldn't open the PayFast payment page. Please try again.");
      } else if (code === "AUTH_REQUIRED") {
        setError("Your session has expired. Please sign in again.");
      } else {
        setError(err?.message || "Unable to start subscription. Please try again.");
      }
    }
  };

  return (
    <div className={className}>
      {phase === PHASE.error && error ? (
        <div
          className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/40"
          role="alert"
        >
          <p className="font-semibold text-red-800 dark:text-red-300">
            {isHandoffError
              ? "We couldn't open the PayFast payment page"
              : isAuthError
                ? "Your session has expired"
                : "Unable to start subscription"}
          </p>
          <p className="mt-1 text-red-700 dark:text-red-400">{error}</p>
          {import.meta.env.DEV && errorCode ? (
            <p className="mt-1 font-mono text-[11px] text-red-500/80">{errorCode}</p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleStart}
        disabled={busy}
        className="w-full bg-gradient-to-r from-[#f24e00] to-[#ff7c00] hover:from-[#e04500] hover:to-[#e66d00] text-white font-bold py-4 px-6 rounded-2xl shadow-lg hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#f24e00] focus:ring-offset-2 min-h-[48px]"
      >
        {busy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" aria-hidden />
            {buttonLabel(phase, ctaLabel)}
          </>
        ) : (
          <>
            {buttonLabel(phase, ctaLabel)}
            {phase === PHASE.idle && priceLabel ? ` (R${priceLabel}/mo)` : ""}
          </>
        )}
      </button>
    </div>
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
