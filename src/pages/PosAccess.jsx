import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Store } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { CompanyContextProvider } from "@/contexts/CompanyContext";
import { OrgBrandProvider } from "@/contexts/OrgBrandContext";
import useCompanyContext from "@/hooks/useCompanyContext";
import PosAccessSignIn from "@/components/pos/PosAccessSignIn";
import { Button } from "@/components/ui/button";
import { normalizePosTillId } from "@shared/posStaffInvite.js";

const POS = lazy(() => import("./POS"));
const POS_CONTEXT_WAIT_MS = 12_000;

function PosLoading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background" aria-label="Loading POS">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function PosLoadError({ message, onRetry }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Store className="size-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-xl font-semibold">POS could not load</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {message || "Check your connection and try again."}
        </p>
      </div>
      <Button type="button" className="h-12 min-w-[10rem]" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/**
 * Dedicated POS entry: /pos and /pos/till/{till-id}.
 * The path is not a credential. Guests always see sign-in/activation.
 * A live Auth session with pos_access opens the till (existing POS session).
 */
export default function PosAccess() {
  const { tillId: tillParam } = useParams();
  const { user } = useAuth() || {};
  const authUserId = getAuthUserId(user);
  const requestedTillId = normalizePosTillId(tillParam);
  const tillLinkInvalid = Boolean(tillParam) && !requestedTillId;

  if (!authUserId) {
    return <PosAccessSignIn />;
  }

  return (
    <CompanyContextProvider>
      <OrgBrandProvider>
        <AuthenticatedPosTill requestedTillId={requestedTillId} tillLinkInvalid={tillLinkInvalid} />
      </OrgBrandProvider>
    </CompanyContextProvider>
  );
}

function AuthenticatedPosTill({ requestedTillId, tillLinkInvalid }) {
  const { user } = useAuth() || {};
  const { loading, error, hasPermission, refresh } = useCompanyContext();
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlowLoad(false);
      return undefined;
    }
    const id = window.setTimeout(() => setSlowLoad(true), POS_CONTEXT_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [loading]);

  if (loading && !slowLoad) return <PosLoading />;

  if (error) {
    return (
      <PosLoadError
        message={error}
        onRetry={() => void refresh({ invalidateCache: true })}
      />
    );
  }

  if (loading && slowLoad) {
    return (
      <PosLoadError
        message="POS is taking too long to load. Check your connection and try again."
        onRetry={() => void refresh({ invalidateCache: true })}
      />
    );
  }

  if (!hasPermission(PERMISSIONS.POS_ACCESS)) {
    return (
      <PosAccessSignIn
        activationOnly
        signedInEmail={user?.email || ""}
        message="This Paidly account is not activated for POS. Use the invitation in your email, or a backup device code."
      />
    );
  }

  if (tillLinkInvalid) {
    return (
      <PosAccessSignIn
        activationOnly
        signedInEmail={user?.email || ""}
        message="This till link is invalid. Ask a manager for the POS access or till URL."
      />
    );
  }

  return (
    <Suspense fallback={<PosLoading />}>
      <POS requestedTillId={requestedTillId || null} />
    </Suspense>
  );
}
