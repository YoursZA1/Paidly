/**
 * Architecture entry path for wake recovery (re-exports implementation in `src/lib/session`).
 */
export {
  WakeRecoveryFailureReason,
  WakeRecoveryState,
  invalidateWakeRecoveryWorkspaceQueries,
  runWakeRecoveryPipeline,
} from "@/lib/session/WakeRecoveryPipeline";
