import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import useCompanyContext from "@/hooks/useCompanyContext";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { hasFeatureAccess } from "@/components/subscription/FeatureGate";
import { canShowPosNav } from "@/lib/posNavAccess";

/**
 * Whether back-office chrome should offer a POS / till entry.
 * Org opted into POS (retail/mixed) + `pos` plan feature + pos_access.
 */
export function useCanShowPosNav() {
  const { user } = useAuth();
  const { profile } = useUserProfileQuery();
  const { hasPermission, isOrgOwner, ctx, posEnabled } = useCompanyContext();

  return useMemo(() => {
    const userPlan =
      profile?.subscription_plan ||
      profile?.plan ||
      user?.subscription_plan ||
      user?.plan ||
      "none";
    return canShowPosNav({
      hasPosCapability: posEnabled === true,
      hasPosEntitlement: hasFeatureAccess(userPlan, "pos"),
      hasPosAccess: hasPermission(PERMISSIONS.POS_ACCESS),
      isOrgOwner: Boolean(isOrgOwner),
      isCompanyMember: Boolean(ctx?.companyId) && !isOrgOwner,
    });
  }, [
    posEnabled,
    profile?.subscription_plan,
    profile?.plan,
    user?.subscription_plan,
    user?.plan,
    hasPermission,
    isOrgOwner,
    ctx?.companyId,
  ]);
}
