import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { CompanyContextProvider } from "@/contexts/CompanyContext";
import { OrgBrandProvider } from "@/contexts/OrgBrandContext";
import useCompanyContext from "@/hooks/useCompanyContext";
import PosAccessSignIn from "@/components/pos/PosAccessSignIn";
import PosErrorBoundary from "@/components/pos/PosErrorBoundary";
import { PosLoadError, PosLoading } from "@/components/pos/PosShellStates";
import { normalizePosTillId } from "@shared/posStaffInvite.js";

const POS = lazy(() => import("./POS"));
const POS_CONTEXT_WAIT_MS = 12_000;

function isLikelyConnectFailure(message) {
  return /failed to fetch|network|timeout|unavailable|connect/i.test(String(message || ""));
}

/**
 * Dedicated POS entry: /pos and /pos/till/{till-id}.
 * The path is not a credential. Guests always see sign-in/activation.
 * A live Auth session with pos_access opens the till (existing POS session).
 */
export default function PosAccess() {
  const { tillId: tillParam } = useParams();
  const { user, loading: authLoading } = useAuth() || {};
  const authUserId = getAuthUserId(user);
  const requestedTillId = normalizePosTillId(tillParam);
  const tillLinkInvalid = Boolean(tillParam) && !requestedTillId;

  if (authLoading && !authUserId) {
    return <PosLoading />;
  }

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

  const retry = () => void refresh({ invalidateCache: true });

  if (loading && !slowLoad) return <PosLoading />;

  if (error) {
    return (
      <PosLoadError
        title={isLikelyConnectFailure(error) ? "Unable to connect to Paidly" : "POS couldn't load"}
        message={
          isLikelyConnectFailure(error)
            ? "Check your connection and try again. Sales are not recorded until Paidly confirms them."
            : error
        }
        onRetry={retry}
      />
    );
  }

  if (loading && slowLoad) {
    return (
      <PosLoadError
        title="Unable to connect to Paidly"
        message="POS is taking too long to load. Check your connection and try again."
        onRetry={retry}
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
    <PosErrorBoundary>
      <Suspense fallback={<PosLoading />}>
        <POS requestedTillId={requestedTillId || null} />
      </Suspense>
    </PosErrorBoundary>
  );
}
