import { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { RefreshCw } from "lucide-react";
import { NumberTicker } from "@/components/dashboard/NumberTicker";
import { currentCalendarMonthLabel } from "@/lib/dashboard/financialSummary";

/** Total income card — full orange-to-gold gradient, matching the preview dashboard. */
export default function CreditCardDisplay({
  balance,
  currency = "ZAR",
  user,
  onRefresh,
  title,
  isDataReady = true,
  variant = "default",
}) {
  const [syncing, setSyncing] = useState(false);
  const displayTitle = title === "Business Balance" ? "Business Balance" : "Total income";
  const numericBalance = typeof balance === "number" && Number.isFinite(balance) ? balance : 0;
  const isCarousel = variant === "carousel";

  const handleRefresh = async () => {
    if (!onRefresh || syncing) return;
    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="w-full min-w-0 dashboard-card dashboard-card-hero px-4 py-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/75">{displayTitle}</p>
        <p className="currency-nums mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">
          <NumberTicker value={numericBalance} currency={currency} enabled={isDataReady} />
        </p>
        <p className="mt-1 text-xs text-white/75">
          {user?.company_name || currentCalendarMonthLabel()}
        </p>
      </div>
      {!isCarousel && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            to={createPageUrl("Invoices")}
            className="text-sm font-medium text-white hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-sm"
          >
            View invoices →
          </Link>
          {typeof onRefresh === "function" && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={syncing}
              aria-label={syncing ? "Syncing balance" : "Sync balance now"}
              className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              {syncing ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
