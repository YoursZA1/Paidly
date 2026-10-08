import { useCallback } from "react";
import { toast } from "@/components/ui/use-toast";
import { billingViewOnlyMessage, labelIsBillingWrite } from "@shared/billingViewOnly.js";
import { getClientEntitlementSnapshot } from "@/lib/clientEntitlement";

function controlLabel(el) {
  return (
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.textContent ||
    ""
  );
}

function writeControlFromEvent(event) {
  const raw = event.target;
  if (!raw || typeof raw.closest !== "function") return null;
  const el = raw.closest("button, a, [role='button'], input[type='submit']");
  if (!el) return null;
  if (el.closest("[data-billing-allow], [data-view-allow]")) return null;
  if (!labelIsBillingWrite(controlLabel(el))) return null;
  return el;
}

/**
 * While a lapsed company is view-only, clicks and submits that start a write are stopped
 * in the page body. Lists, filters, downloads, and the subscribe banner stay usable.
 */
export default function BillingViewOnlyGuard({ active, className = "", children }) {
  const stop = useCallback((event) => {
    if (!writeControlFromEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    toast({
      title: "View only",
      description: billingViewOnlyMessage(getClientEntitlementSnapshot().status),
    });
  }, []);

  if (!active) return children;
  return (
    <div className={className} onClickCapture={stop} onSubmitCapture={stop}>
      {children}
    </div>
  );
}
