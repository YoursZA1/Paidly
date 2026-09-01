import { lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { PERMISSIONS } from "@/lib/companyPermissions";
import useCompanyContext from "@/hooks/useCompanyContext";
import PosAccessSignIn from "@/components/pos/PosAccessSignIn";
import { normalizePosTillId } from "@shared/posStaffInvite.js";

const POS = lazy(() => import("./POS"));

function PosLoading() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-background" aria-label="Loading POS">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
    <AuthenticatedPosTill requestedTillId={requestedTillId} tillLinkInvalid={tillLinkInvalid} />
  );
}

function AuthenticatedPosTill({ requestedTillId, tillLinkInvalid }) {
  const { user } = useAuth() || {};
  const { loading, hasPermission } = useCompanyContext();

  if (loading) return <PosLoading />;

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
