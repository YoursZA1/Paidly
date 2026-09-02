import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Crown, Lock, Store } from "lucide-react";
import FeatureGate from "@/components/subscription/FeatureGate";
import PosTerminal from "@/components/pos/PosTerminal";
import { PosLoading } from "@/components/pos/PosShellStates";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { isPosOnlyStaff } from "@shared/posStaffInvite.js";
import useCompanyContext from "@/hooks/useCompanyContext";

function PosPlanLock() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Lock className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-xl font-semibold">POS needs Business</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The till sells from your catalog and updates stock. Upgrade to open it.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild className="h-12 min-w-[10rem]">
          <Link to={`${createPageUrl("Settings")}?tab=subscription`}>
            <Crown className="size-4" />
            View plans
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to={createPageUrl("Dashboard")}>Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function PosBusinessTypeLock({ posOnlyStaff = false }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Store className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-xl font-semibold">POS is optional</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {posOnlyStaff
            ? "This company is not set up for a till. Ask a manager to switch the business type to Retail or Mixed."
            : "Service businesses use invoices, quotes, and clients. Switch to Retail or Mixed to open a till."}
        </p>
      </div>
      {posOnlyStaff ? null : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button asChild className="h-12 min-w-[10rem]">
            <Link to={`${createPageUrl("Settings")}?tab=profile`}>Choose business type</Link>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <Link to={createPageUrl("Dashboard")}>Back to dashboard</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function POS({ requestedTillId = null } = {}) {
  const { profile, authReady } = useAuth();
  const { loading, posEnabled, isOrgOwner, companyRole, jobFunction } = useCompanyContext();
  const posOnlyStaff = isPosOnlyStaff({ isOrgOwner, companyRole, jobFunction });
  const userPlan = useMemo(
    () => profile?.subscription_plan || profile?.plan || "starter",
    [profile]
  );

  if (loading || (!posOnlyStaff && !authReady)) {
    return <PosLoading />;
  }

  const till = posEnabled ? (
    <PosTerminal requestedTillId={requestedTillId} />
  ) : (
    <PosBusinessTypeLock posOnlyStaff={posOnlyStaff} />
  );
  if (posOnlyStaff) return till;

  return (
    <FeatureGate feature="pos" userPlan={userPlan} fallback={<PosPlanLock />}>
      {till}
    </FeatureGate>
  );
}
