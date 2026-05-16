import { MutationCoordinator } from "@/core/sync/MutationCoordinator";

/** Shared dedupe for offline sync queue jobs (CREATE_INVOICE, etc.). */
export const syncMutationCoordinator = new MutationCoordinator();
