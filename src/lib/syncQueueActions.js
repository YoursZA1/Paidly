import { useSyncQueueStore } from "@/stores/useSyncQueueStore";
import { SYNC_JOB_TYPES } from "@/lib/syncJobProcessor";
import { useAppStore } from "@/stores/useAppStore";

export function queueCreateInvoice(invoiceData, meta = {}) {
  const tempId = `temp_invoice_${Date.now()}`;
  useAppStore.getState().prependOptimisticInvoice({
    id: tempId,
    ...invoiceData,
    status: invoiceData?.status || "draft",
    sync_state: "queued",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  return useSyncQueueStore.getState().addToQueue(
    SYNC_JOB_TYPES.CREATE_INVOICE,
    { invoiceData },
    { maxRetries: 5, conflictKey: `invoice:create:${invoiceData?.invoice_number || tempId}`, optimisticTempId: tempId, ...meta }
  );
}

export function queueSendInvoice(invoiceId, options = {}, meta = {}) {
  if (invoiceId) {
    useAppStore.getState().setInvoice(invoiceId, {
      status: "sent",
      sent_date: new Date().toISOString(),
      sync_state: "sending",
    });
  }
  return useSyncQueueStore.getState().addToQueue(
    SYNC_JOB_TYPES.SEND_INVOICE,
    { invoiceId, options },
    { maxRetries: 6, conflictKey: `invoice:send:${invoiceId || "unknown"}`, ...meta }
  );
}

export function queueUpdateClient(clientId, clientData, meta = {}) {
  if (clientId) {
    useAppStore.getState().upsertClient(clientId, {
      ...clientData,
      sync_state: "queued",
    });
  }
  return useSyncQueueStore.getState().addToQueue(
    SYNC_JOB_TYPES.UPDATE_CLIENT,
    { clientId, clientData },
    { maxRetries: 5, conflictKey: `client:update:${clientId || "unknown"}`, ...meta }
  );
}

