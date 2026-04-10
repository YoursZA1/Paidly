import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PayFast cancel_url landing — user cancelled before completing payment.
 */
export default function PayfastCancel() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-gradient-to-b from-slate-50 to-background dark:from-slate-900/40">
      <div className="max-w-md w-full text-center space-y-6 rounded-3xl border bg-card p-8 shadow-lg">
        <div className="flex justify-center">
          <XCircle className="h-16 w-16 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Checkout cancelled</h1>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            No charge was made. You can return to subscription settings anytime to choose a plan.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Settings")}>Back to plans</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Home")}>Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
