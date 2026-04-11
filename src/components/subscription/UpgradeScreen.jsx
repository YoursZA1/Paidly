import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { useUpgradeModalStore } from "@/stores/useUpgradeModalStore";

/**
 * Full-app blocking screen when `profiles.subscription_status === "expired"`.
 * Primary path: Settings → subscription tab to pay. Logout available.
 */
export default function UpgradeScreen({ onLogout }) {
  const billingUrl = `${createPageUrl("Settings")}?tab=subscription`;
  const openUpgradeModal = useUpgradeModalStore((s) => s.openUpgradeModal);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/40 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-md text-center space-y-8"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
          <Clock className="h-8 w-8" aria-hidden />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground font-display">
            Your access has paused
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            Your trial or subscription has ended. Renew to keep using invoices, quotes, and the rest of
            Paidly.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
          <Button
            type="button"
            size="lg"
            className="rounded-xl gap-2 shadow-lg shadow-primary/20"
            onClick={() => openUpgradeModal({})}
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Choose plan &amp; pay
          </Button>
          <Button variant="outline" size="lg" asChild className="rounded-xl">
            <Link to={billingUrl}>Compare in Settings</Link>
          </Button>
          {typeof onLogout === "function" ? (
            <Button type="button" variant="outline" size="lg" className="rounded-xl gap-2" onClick={() => onLogout()}>
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              Log out
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Questions? Open{" "}
          <Link to={billingUrl} className="text-primary underline-offset-4 hover:underline font-medium">
            Subscription
          </Link>{" "}
          in Settings after signing in.
        </p>
      </motion.div>
    </div>
  );
}
