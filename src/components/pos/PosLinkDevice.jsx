import { Link } from "react-router-dom";
import { Link2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { posJoinPath } from "@shared/posStaffInvite.js";

/**
 * Bare /pos on a device that has never opened a till. A 6-digit code alone cannot identify a
 * business safely, so the device first needs its till link (Settings → POS → Registers → Copy till
 * link). After that, /pos opens straight to that till's code screen.
 */
export default function PosLinkDevice({ onUseOwnerSignIn }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary">
          <Store className="size-7 text-primary-foreground" aria-hidden />
        </div>
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">Paidly POS</p>
        <h1 className="mt-3 font-display text-2xl font-bold">Open your till link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This device isn&apos;t linked to a till yet. Open the till link your manager shared once — after that, this device goes
          straight to the till and you only enter your POS access code.
        </p>
        <div className="mt-6 space-y-2">
          <Button asChild variant="outline" className="h-12 w-full">
            <Link to={posJoinPath()}>
              <Link2 className="size-4" /> I have a device code
            </Link>
          </Button>
          {onUseOwnerSignIn ? (
            <Button type="button" variant="ghost" className="h-11 w-full" onClick={onUseOwnerSignIn}>
              Owner or manager? Sign in with Paidly
            </Button>
          ) : null}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Need help? Contact your business administrator.</p>
      </div>
    </div>
  );
}
