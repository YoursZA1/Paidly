import { useMemo } from "react";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { canShowPosNav } from "@/lib/posNavAccess";
import { useEntitlementAccess } from "@/hooks/useEntitlementAccess";

/**
 * Whether back-office chrome should offer a POS / till entry.
 * Org opted into POS (retail/mixed) + subscription `pos` feature + pos_access.
 */
export function useCanShowPosNav() {
  const { hasPermission, isOrgOwner, ctx, posEnabled } = useCompanyContext();
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
    return canShowPosNav({
      hasPosCapability: posEnabled === true,
      hasPosEntitlement,
      hasPosAccess: hasPermission(PERMISSIONS.POS_ACCESS),
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
    ctx?.companyId,
  ]);
}
