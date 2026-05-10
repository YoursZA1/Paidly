/**
 * Core session / connection lifecycle entry points (architecture namespace).
 * Implementation remains in `src/lib/connection/*` and `src/lib/session/*`; this folder is the stable import surface.
 */
export { ConnectionState, LifecycleEventType } from "@/core/session/lifecycleTypes";
export { reportLifecycleEvent } from "@/core/session/reportLifecycleEvent";
export {
  WakeRecoveryFailureReason,
  WakeRecoveryState,
  invalidateWakeRecoveryWorkspaceQueries,
  runWakeRecoveryPipeline,
} from "@/core/session/WakeRecoveryPipeline";
export {
  WakeRecoveryLifecycleEventType,
  WakeRecoveryLifecyclePhase,
  dispatchWakeRecoveryLifecycleEvent,
  installWakeRecoveryLifecycleTelemetry,
} from "@/core/session/wakeRecoveryLifecycleEvents";
