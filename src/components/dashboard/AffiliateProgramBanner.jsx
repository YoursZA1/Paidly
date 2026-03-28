import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/AuthContext";
import { createAffiliateDashboardUrl } from "@/utils";

const storageKey = (userId) => `paidly_affiliate_prompt_dismissed_${userId}`;

/**
 * Post-login nudge — drives existing users to the in-app affiliate dashboard.
 */
export default function AffiliateProgramBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setDismissed(true);
      return;
    }
    try {
      setDismissed(window.localStorage.getItem(storageKey(user.id)) === "1");
    } catch {
      setDismissed(false);
    }
  }, [user?.id]);

  const dismiss = () => {
    if (!user?.id) return;
    try {
      window.localStorage.setItem(storageKey(user.id), "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (!user?.id || dismissed) return null;

  return (
    <div className="mb-4 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 sm:mb-6 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Earn with Paidly</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            You can earn recurring commission by referring businesses to Paidly. Open your affiliate dashboard to get your link.
          </p>
        </div>
      </div>
      <div className="mt-3 flex shrink-0 items-center gap-2 sm:mt-0">
        <Link
          to={createAffiliateDashboardUrl()}
          className="inline-flex rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 sm:text-sm"
        >
          View affiliate program
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
