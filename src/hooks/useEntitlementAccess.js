import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { useCurrentSubscriptionQuery } from "@/hooks/useCurrentSubscriptionQuery";
import {
  clientHasFeature,
  clientPlanSlugForDisplay,
  deriveEntitlementFromSubscriptionCurrent,
  publishClientEntitlement,
} from "@/lib/clientEntitlement";

/**
 * Subscription-backed entitlement for UI / EntityManager cache.
 * Server gates remain authoritative.
 */
export function useEntitlementAccess({ enabled = true } = {}) {
  const { user } = useAuth();
  const { profile } = useUserProfileQuery();
  const profileSlug =
    profile?.subscription_plan ||
    profile?.plan ||
    user?.subscription_plan ||
    user?.plan ||
    null;

  const query = useCurrentSubscriptionQuery({ enabled });
  const { data, isFetched, isError, isLoading } = query;

  const entitlement = useMemo(() => {
    if (!enabled) {
      return deriveEntitlementFromSubscriptionCurrent(null, { profileSlug });
    }
    if (!isFetched || isError) {
      return deriveEntitlementFromSubscriptionCurrent(null, { profileSlug });
    }
    return deriveEntitlementFromSubscriptionCurrent(data, { profileSlug });
  }, [enabled, isFetched, isError, data, profileSlug]);

  useEffect(() => {
    publishClientEntitlement(entitlement);
  }, [entitlement]);

  const planSlug = clientPlanSlugForDisplay({ snapshot: entitlement });

  return {
    ...query,
    entitlement,
    isEntitlementReady: entitlement.ready,
    accessGranted: entitlement.accessGranted,
    planSlug,
    planFamily: entitlement.planFamily,
    source: entitlement.source,
    isLoading: Boolean(enabled && isLoading),
    hasFeature: (feature) => clientHasFeature(feature, { snapshot: entitlement }),
  };
}
