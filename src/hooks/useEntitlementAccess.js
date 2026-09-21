import { useEffect, useMemo } from "react";
import { useCurrentSubscriptionQuery } from "@/hooks/useCurrentSubscriptionQuery";
import {
  clientHasFeature,
  clientPlanSlugForDisplay,
  deriveEntitlementFromSubscriptionCurrent,
  publishClientEntitlement,
} from "@/lib/clientEntitlement";

/**
 * The one client source for "which package is this company on and what may it do".
 * Backed by GET /api/subscriptions/current → `entitlement`, built by the same resolver as the
 * server feature gates. Never reads profiles.plan. Server gates remain authoritative.
 */
export function useEntitlementAccess({ enabled = true } = {}) {
  const query = useCurrentSubscriptionQuery({ enabled });
  const { data, isFetched, isError, isLoading } = query;

  const entitlement = useMemo(() => {
    if (!enabled || !isFetched || isError) return deriveEntitlementFromSubscriptionCurrent(null);
    return deriveEntitlementFromSubscriptionCurrent(data);
  }, [enabled, isFetched, isError, data]);

  useEffect(() => {
    publishClientEntitlement(entitlement);
  }, [entitlement]);

  const planSlug = clientPlanSlugForDisplay({ snapshot: entitlement });

  return {
    ...query,
    entitlement,
    isEntitlementReady: entitlement.ready,
    accessGranted: entitlement.accessGranted,
    /** Family with access ("starter" | "business" | "growth" | "enterprise"), else "none". */
    planSlug,
    planFamily: entitlement.planFamily,
    /** Package on the subscription row even when access has lapsed (for "Growth — expired" copy). */
    subscribedPlan: entitlement.subscribedPlan,
    subscriptionStatus: entitlement.status,
    trialing: entitlement.trialing,
    trialDaysRemaining: entitlement.trialDaysRemaining,
    limits: entitlement.limits,
    source: entitlement.source,
    isLoading: Boolean(enabled && isLoading),
    hasFeature: (feature) => clientHasFeature(feature, { snapshot: entitlement }),
  };
}
