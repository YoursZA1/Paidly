import { DEFAULT_PLANS, PLAN_ORDER, createDefaultFeatures } from "@/data/planDefaults";
import { refreshPlanLimits } from "@/data/planLimits";

const STORAGE_KEY = "breakapi_plan_definitions";

const slugify = (value) =>
  (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const getTimestamp = () => new Date().toISOString();

const createHistoryEntry = (plan, updatedBy, changeNote) => ({
  version: plan.version || 1,
  timestamp: getTimestamp(),
  updatedBy: updatedBy || "system",
  changeNote: changeNote || "",
  snapshot: { ...plan }
});

const createDefaultState = () => {
  const now = getTimestamp();
  const plans = {};
  const history = {};

  Object.entries(DEFAULT_PLANS).forEach(([key, plan]) => {
    const seededPlan = {
      ...plan,
      key,
      version: plan.version || 1,
      createdAt: plan.createdAt || now,
      updatedAt: plan.updatedAt || now,
      features: plan.features || createDefaultFeatures()
    };

    plans[key] = seededPlan;
    history[key] = [createHistoryEntry(seededPlan, "system", "Initial plan seed")];
  });

  return {
    plans,
    history,
    order: [...PLAN_ORDER]
  };
};

const loadState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createDefaultState();

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") {
      return createDefaultState();
    }

    if (!parsed.plans) {
      return createDefaultState();
    }

    return {
      plans: parsed.plans,
      history: parsed.history || {},
      order: parsed.order || [...PLAN_ORDER]
    };
  } catch (error) {
    console.error("Error loading plan definitions:", error);
    return createDefaultState();
  }
};

const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  refreshPlanLimits();
};

class PlanManagementService {
  static getPlanOrder() {
    const state = loadState();
    const keys = Object.keys(state.plans);
    const normalizedOrder = (state.order || []).filter((key) => keys.includes(key));
    const remaining = keys.filter((key) => !normalizedOrder.includes(key)).sort();
    return [...normalizedOrder, ...remaining];
  }

  static getPlans() {
    const state = loadState();
    const order = this.getPlanOrder();
    return order.map((key) => ({
      key,
      ...state.plans[key]
    }));
  }

  static getPlan(planKey) {
    const state = loadState();
    return state.plans[planKey] || null;
  }

  static getPlanHistory(planKey) {
    const state = loadState();
    return state.history?.[planKey] || [];
  }

  static createPlan(plan, options = {}) {
    const state = loadState();
    const key = slugify(plan.key || plan.name);
    if (!key) {
      throw new Error("Plan key is required.");
    }
    if (state.plans[key]) {
      throw new Error("Plan key already exists.");
    }

    const now = getTimestamp();
    const nextPlan = {
      ...plan,
      key,
      name: plan.name || key,
      userLimit: plan.userLimit ?? 1,
      users: plan.userLimit ?? plan.users ?? 1,
      invoices_limit: plan.invoices_limit ?? 0,
      quotes_limit: plan.quotes_limit ?? 0,
      storage: plan.storage || "1GB",
      priceMonthly: plan.priceMonthly ?? 0,
      priceYearly: plan.priceYearly ?? 0,
      status: plan.status || "active",
      recommended: Boolean(plan.recommended),
      features: plan.features || createDefaultFeatures(),
      version: 1,
      createdAt: now,
      updatedAt: now
    };

    state.plans[key] = nextPlan;
    state.history[key] = [createHistoryEntry(nextPlan, options.updatedBy, options.changeNote || "Plan created")];

    if (!state.order.includes(key)) {
      state.order.push(key);
    }

    if (nextPlan.recommended) {
      this._applyRecommendedPlan(state, key, options);
    }

    saveState(state);
    return nextPlan;
  }

  static updatePlan(planKey, updates, options = {}) {
    const state = loadState();
    const existing = state.plans[planKey];
    if (!existing) {
      throw new Error("Plan not found.");
    }

    const now = getTimestamp();
    const userLimit = updates.userLimit !== undefined ? updates.userLimit : existing.userLimit;
    const usersValue = updates.users !== undefined
      ? updates.users
      : userLimit === null
        ? "Unlimited"
        : userLimit;

    const nextPlan = {
      ...existing,
      ...updates,
      key: planKey,
      userLimit,
      users: usersValue,
      features: {
        ...(existing.features || {}),
        ...(updates.features || {})
      },
      version: (existing.version || 1) + 1,
      updatedAt: now
    };

    state.plans[planKey] = nextPlan;
    state.history[planKey] = [
      ...(state.history[planKey] || []),
      createHistoryEntry(nextPlan, options.updatedBy, options.changeNote || "Plan updated")
    ];

    if (updates.recommended === true) {
      this._applyRecommendedPlan(state, planKey, options);
    }

    saveState(state);
    return nextPlan;
  }

  static archivePlan(planKey, options = {}) {
    return this.updatePlan(planKey, { status: "archived" }, options);
  }

  static setRecommendedPlan(planKey, recommended, options = {}) {
    const state = loadState();
    if (!state.plans[planKey]) {
      throw new Error("Plan not found.");
    }

    if (!recommended) {
      return this.updatePlan(planKey, { recommended: false }, options);
    }

    this._applyRecommendedPlan(state, planKey, options);
    saveState(state);
    return state.plans[planKey];
  }

  static restorePlanVersion(planKey, version, options = {}) {
    const state = loadState();
    const history = state.history?.[planKey] || [];
    const entry = history.find((item) => item.version === version);
    if (!entry) {
      throw new Error("Version not found.");
    }

    const now = getTimestamp();
    const nextPlan = {
      ...entry.snapshot,
      key: planKey,
      version: (state.plans[planKey]?.version || 1) + 1,
      updatedAt: now
    };

    state.plans[planKey] = nextPlan;
    state.history[planKey] = [
      ...history,
      createHistoryEntry(nextPlan, options.updatedBy, options.changeNote || "Restored plan version")
    ];

    saveState(state);
    return nextPlan;
  }

  static exportPlans() {
    const state = loadState();
    return {
      exportedAt: getTimestamp(),
      plans: state.plans,
      history: state.history,
      order: state.order
    };
  }

  static _applyRecommendedPlan(state, planKey, options) {
    const now = getTimestamp();
    Object.keys(state.plans).forEach((key) => {
      const isRecommended = key === planKey;
      const plan = state.plans[key];
      if (plan.recommended === isRecommended) return;

      const nextPlan = {
        ...plan,
        recommended: isRecommended,
        version: (plan.version || 1) + 1,
        updatedAt: now
      };

      state.plans[key] = nextPlan;
      state.history[key] = [
        ...(state.history[key] || []),
        createHistoryEntry(nextPlan, options?.updatedBy, "Recommended plan update")
      ];
    });
  }
}

export default PlanManagementService;
