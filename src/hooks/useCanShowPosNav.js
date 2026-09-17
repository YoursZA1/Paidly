import { useMemo } from "react";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { canShowPosNav } from "@/lib/posNavAccess";
import { useEntitlementAccess } from "@/hooks/useEntitlementAccess";
import { membershipCanEnterPos } from "@shared/posStaffInvite.js";

/**
 * Whether back-office chrome should offer a POS / till entry.
 * Org opted into POS (retail/mixed) + subscription `pos` feature + POS-enabled membership
 * (or owner/manager). Generic employee `pos_access` RBAC alone is not enough.
 */
export function useCanShowPosNav() {
  const { hasPermission, isOrgOwner, companyRole, jobFunction, ctx, posEnabled } = useCompanyContext();
  const { hasFeature, isEntitlementReady, isLoading } = useEntitlementAccess({
    enabled: Boolean(ctx?.companyId || isOrgOwner),
  });

  return useMemo(() => {
    // While subscription SoR is loading, do not advertise POS from a stale profile plan.
    const hasPosEntitlement = isEntitlementReady
      ? hasFeature("pos")
      : isLoading
        ? false
        : hasFeature("pos");
    const mayEnterPos =
      hasPermission(PERMISSIONS.POS_ACCESS) &&
      membershipCanEnterPos({
        isOrgOwner,
        companyRole,
        jobFunction,
        posRegisterId: ctx?.posRegisterId,
      });
    return canShowPosNav({
      hasPosCapability: posEnabled === true,
      hasPosEntitlement,
      hasPosAccess: mayEnterPos,
      isOrgOwner: Boolean(isOrgOwner),
      isCompanyMember: Boolean(ctx?.companyId) && !isOrgOwner,
    });
  }, [
    posEnabled,
    hasFeature,
    isEntitlementReady,
    isLoading,
    hasPermission,
    isOrgOwner,
    companyRole,
    jobFunction,
    ctx?.companyId,
    ctx?.posRegisterId,
  ]);
}
