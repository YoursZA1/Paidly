/**
 * Paidly runtime core — incremental adoption. See `docs/architecture-improvement-plan.md`.
 */
export {
  useRuntimeCoordinator,
  getRuntimeCoordinatorSnapshot,
  subscribeRuntimeCoordinator,
  type RuntimePhase,
} from "./runtime/RuntimeCoordinator";
export * from "./query/queryPolicies";
export * from "./query/persistedQueryClient";
export { RealtimeManager } from "./realtime/RealtimeManager";
export { MutationCoordinator } from "./sync/MutationCoordinator";
export { RequestCoordinator, retryWithBudget } from "./network/RequestCoordinator";
export * from "./errors";
