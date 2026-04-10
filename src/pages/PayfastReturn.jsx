import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PayFast return_url landing — used for /return and /success after completing checkout.
 */
export default function PayfastReturn() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-gradient-to-b from-orange-50/80 to-background dark:from-orange-950/20">
      <div className="max-w-md w-full text-center space-y-6 rounded-3xl border border-orange-100 dark:border-orange-900/40 bg-card p-8 shadow-lg">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-orange-500" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payment received</h1>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Thanks — PayFast has returned you to Paidly. Your plan usually updates within a minute after PayFast
            confirms payment. Open subscription settings below, or refresh the page if your tier still looks
            unchanged.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Settings")}>Open subscription settings</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Home")}>Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
