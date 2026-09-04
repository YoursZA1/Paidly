import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { buildCompanyAccessContext, PERMISSIONS } from "@/lib/companyPermissions";
import { CompanyContextProvider } from "@/contexts/CompanyContext";
import { OrgBrandProvider } from "@/contexts/OrgBrandContext";
import useCompanyContext from "@/hooks/useCompanyContext";
import PosAccessSignIn from "@/components/pos/PosAccessSignIn";
import PosErrorBoundary from "@/components/pos/PosErrorBoundary";
import PosShiftLanding from "@/components/pos/PosShiftLanding";
import { PosLoadError, PosLoading } from "@/components/pos/PosShellStates";
import { isPosOnlyStaff, normalizePosTillId } from "@shared/posStaffInvite.js";
import { fetchPosAccess } from "@/lib/pos/posAccessClient";
import { openPosSession, listPosSessions } from "@/services/PosIntegrationService";
import { writeActiveRegisterId } from "@/lib/pos/posRegisterStorage";

const POS = lazy(() => import("./POS"));
const POS_CONTEXT_WAIT_MS = 12_000;

function isLikelyConnectFailure(message) {
  return /failed to fetch|network|timeout|unavailable|connect/i.test(String(message || ""));
}

function contextFromPosAccess(access) {
  if (!access?.org?.id) return null;
  return buildCompanyAccessContext({
    userId: access.employee?.user_id || access.session_id || "pos-access",
    companyId: access.org.id,
    membershipRole: access.role || "employee",
    jobFunction: access.job_function || "pos",
    businessType: access.org.business_type || "mixed",
    posRegisterId: access.register?.id || null,
  });
}

/**
 * Dedicated POS entry: /pos and /pos/till/{till-id}.
 * The path is not a credential. Guests need a POS access pass or Paidly Auth with pos_access.
 */
export default function PosAccess() {
  const { tillId: tillParam } = useParams();
  const { user, loading: authLoading } = useAuth() || {};
  const authUserId = getAuthUserId(user);
  const requestedTillId = normalizePosTillId(tillParam);
  const tillLinkInvalid = Boolean(tillParam) && !requestedTillId;
  const [posAccess, setPosAccess] = useState(null);
  const [posLoading, setPosLoading] = useState(!authUserId);

  useEffect(() => {
    if (authUserId) {
      setPosLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPosLoading(true);
    void fetchPosAccess()
      .then((data) => {
        if (!cancelled) setPosAccess(data);
      })
      .finally(() => {
        if (!cancelled) setPosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  if ((authLoading && !authUserId) || posLoading) {
    return <PosLoading />;
  }

  if (!authUserId && posAccess) {
    const forced = contextFromPosAccess(posAccess);
    return (
      <CompanyContextProvider forcedContext={forced}>
        <OrgBrandProvider>
          <PosPassTill access={posAccess} requestedTillId={requestedTillId} tillLinkInvalid={tillLinkInvalid} />
        </OrgBrandProvider>
      </CompanyContextProvider>
    );
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

function PosPassTill({ access, requestedTillId, tillLinkInvalid }) {
  const [entered, setEntered] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftError, setShiftError] = useState("");

  if (tillLinkInvalid) {
    return (
      <PosAccessSignIn
        activationOnly
        message="This till link is invalid. Ask a manager for the POS invitation or till URL."
      />
    );
  }

  const startOrResume = async (openingBalance) => {
    setShiftBusy(true);
    setShiftError("");
    try {
      const registerId = access.register?.id;
      if (registerId && access.org?.id) writeActiveRegisterId(access.org.id, registerId);
      if (!access.open_shift?.id) {
        await openPosSession({
          register_id: registerId,
          opening_balance: openingBalance,
        });
      }
      setEntered(true);
    } catch (err) {
      setShiftError(err?.message || "Could not start shift");
    } finally {
      setShiftBusy(false);
    }
  };

  if (!entered) {
    return (
      <PosShiftLanding
        employeeName={access.employee?.name || ""}
        employeeEmail={access.employee?.email || ""}
        businessName={access.org?.name || ""}
        tillName={access.register?.name || ""}
        openShift={access.open_shift}
        openingBalance={0}
        busy={shiftBusy}
        error={shiftError}
        onStartShift={(opening) => void startOrResume(opening)}
        onResumeShift={() => void startOrResume(0)}
      />
    );
  }

  return (
    <PosErrorBoundary>
      <Suspense fallback={<PosLoading />}>
        <POS requestedTillId={requestedTillId || access.register?.id || null} posPass />
      </Suspense>
    </PosErrorBoundary>
  );
}

function AuthenticatedPosTill({ requestedTillId, tillLinkInvalid }) {
  const { user } = useAuth() || {};
  const { loading, error, hasPermission, refresh, isOrgOwner, companyRole, jobFunction, ctx } =
    useCompanyContext();
  const [slowLoad, setSlowLoad] = useState(false);
  const [entered, setEntered] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const posOnlyStaff = isPosOnlyStaff({ isOrgOwner, companyRole, jobFunction });

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

  if (posOnlyStaff && !entered) {
    return (
      <AuthenticatedShiftLanding
        user={user}
        registerId={ctx?.posRegisterId || requestedTillId}
        orgId={ctx?.companyId}
        busy={shiftBusy}
        error={shiftError}
        onEnter={() => setEntered(true)}
        setBusy={setShiftBusy}
        setError={setShiftError}
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

function AuthenticatedShiftLanding({ user, registerId, orgId, busy, error, onEnter, setBusy, setError }) {
  const [openShift, setOpenShift] = useState(null);

  useEffect(() => {
    if (!registerId) return undefined;
    let cancelled = false;
    void listPosSessions({ register_id: registerId, status: "open", limit: 1 })
      .then((sessions) => {
        if (!cancelled) setOpenShift(sessions[0] || null);
      })
      .catch(() => {
        if (!cancelled) setOpenShift(null);
      });
    return () => {
      cancelled = true;
    };
  }, [registerId]);

  const start = async (openingBalance) => {
    setBusy(true);
    setError("");
    try {
      if (orgId && registerId) writeActiveRegisterId(orgId, registerId);
      if (registerId && !openShift?.id) {
        await openPosSession({
          register_id: registerId,
          opening_balance: openingBalance,
        });
      }
      onEnter();
    } catch (err) {
      if (/already has an open shift|SESSION_OPEN/i.test(String(err?.message || ""))) {
        onEnter();
        return;
      }
      setError(err?.message || "Could not start shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PosShiftLanding
      employeeName={user?.user_metadata?.full_name || user?.email || ""}
      employeeEmail={user?.email || ""}
      businessName=""
      tillName="Assigned till"
      openShift={openShift}
      busy={busy}
      error={error}
      onStartShift={(opening) => void start(opening)}
      onResumeShift={() => onEnter()}
    />
  );
}

void endPosAccess;
