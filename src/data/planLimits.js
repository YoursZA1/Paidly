import { DEFAULT_PLANS, FEATURE_CATALOG, PLAN_ORDER } from "@/data/planDefaults";

// Display list derived from the canonical catalog (planDefaults ← shared/planFeatures.js).
// The old localStorage override ("breakapi_plan_definitions") is ignored: plans are not editable client-side.
const loadStoredState = () => null;

const mergePlan = (basePlan, overridePlan) => {
  if (!basePlan) return overridePlan;
  if (!overridePlan) return basePlan;

  const merged = {
    ...basePlan,
    ...overridePlan
  };

  merged.features = {
    ...(basePlan.features || {}),
    ...(overridePlan.features || {})
  };

  return merged;
};

const buildPlansFromStorage = () => {
  const storedState = loadStoredState();
  const storedPlans = storedState?.plans || {};
  const planKeys = new Set([...Object.keys(DEFAULT_PLANS), ...Object.keys(storedPlans)]);
  const mergedPlans = {};

  planKeys.forEach((key) => {
    mergedPlans[key] = mergePlan(DEFAULT_PLANS[key], storedPlans[key]);
  });

  return mergedPlans;
};

// Plan definitions with user limits (mutable for refresh)
export const PLANS = {};

export const refreshPlanLimits = () => {
  const mergedPlans = buildPlansFromStorage();
  Object.keys(PLANS).forEach((key) => {
    delete PLANS[key];
  });
  Object.assign(PLANS, mergedPlans);
  return PLANS;
};

refreshPlanLimits();

// Get active user count
export function getActiveUserCount(users) {
  return users.filter(u => u.status === "active").length;
}

// Get remaining user slots
export function getRemainingUserSlots(users, planKey) {
  const plan = PLANS[planKey];
  if (!plan) return 0;
  if (plan.userLimit === null) return Infinity; // Unlimited
  
  const activeCount = getActiveUserCount(users);
  return Math.max(0, plan.userLimit - activeCount);
}

// Check if user limit reached
export function isUserLimitReached(users, planKey) {
  const remaining = getRemainingUserSlots(users, planKey);
  return remaining === 0;
}

// Get plan by key
export function getPlan(planKey) {
  if (!PLANS[planKey]) {
    refreshPlanLimits();
  }
  return PLANS[planKey] || PLANS.free;
}

export function getPlanOrder() {
  const storedState = loadStoredState();
  const storedOrder = storedState?.order || PLAN_ORDER;
  const keys = Object.keys(PLANS);
  const normalizedOrder = storedOrder.filter((key) => keys.includes(key));
  const remaining = keys
    .filter((key) => !normalizedOrder.includes(key))
    .sort((a, b) => a.localeCompare(b));
  return [...normalizedOrder, ...remaining];
}

export function getFeatureCatalog() {
  return FEATURE_CATALOG;
}
