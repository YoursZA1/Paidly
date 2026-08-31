import { Client, Invoice } from "@/api/entities";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";
import { syncMutationCoordinator } from "@/lib/syncMutationCoordinator";

export const SYNC_JOB_TYPES = {
  CREATE_INVOICE: "CREATE_INVOICE",
  UPDATE_INVOICE: "UPDATE_INVOICE",
  SEND_INVOICE: "SEND_INVOICE",
  UPDATE_CLIENT: "UPDATE_CLIENT",
};

// POS checkout is not a sync-queue job. Till money needs /api/pos/checkout
// (payment intent + inventory). Do not add CREATE_POS_SALE here.

export async function processSyncJob(job) {
  switch (job.type) {
    case SYNC_JOB_TYPES.CREATE_INVOICE: {
      const operationId = job.meta?.operationId;
      const invoiceData = { ...(job.payload?.invoiceData || {}) };
      if (operationId) {
        invoiceData.client_operation_id = operationId;
      }
      const runCreate = async () => {
        const created = await Invoice.create(invoiceData);
        return { id: created?.id || null };
      };
      if (operationId) {
        return syncMutationCoordinator.runOnce(operationId, runCreate);
      }
      return runCreate();
    }
    case SYNC_JOB_TYPES.UPDATE_INVOICE: {
      const invoiceId = job.payload?.invoiceId;
      if (!invoiceId) throw new Error("Missing invoiceId for UPDATE_INVOICE");
      const operationId = job.meta?.operationId;
      const runUpdate = async () => {
        const updated = await Invoice.update(invoiceId, job.payload?.invoiceData || {});
        return { id: updated?.id || invoiceId };
      };
      if (operationId) {
        return syncMutationCoordinator.runOnce(operationId, runUpdate);
      }
      return runUpdate();
    }
    case SYNC_JOB_TYPES.SEND_INVOICE: {
      const invoiceId = job.payload?.invoiceId;
      if (!invoiceId) throw new Error("Missing invoiceId for SEND_INVOICE");
      const operationId = job.meta?.operationId;
      const runSend = async () => {
        const result = await sendInvoiceToClient(invoiceId, {
          ...(job.payload?.options || {}),
          sendOperationId: operationId || job.payload?.options?.sendOperationId,
        });
        return result || { invoiceId };
      };
      if (operationId) {
        return syncMutationCoordinator.runOnce(operationId, runSend);
      }
      return runSend();
    }
    case SYNC_JOB_TYPES.UPDATE_CLIENT: {
      const clientId = job.payload?.clientId;
      if (!clientId) throw new Error("Missing clientId for UPDATE_CLIENT");
      const operationId = job.meta?.operationId;
      const runUpdate = async () => {
        const updated = await Client.update(clientId, job.payload?.clientData || {});
        return { id: updated?.id || clientId };
      };
      if (operationId) {
        return syncMutationCoordinator.runOnce(operationId, runUpdate);
      }
      return runUpdate();
    }
    default:
      throw new Error(`Unsupported sync job type: ${job.type}`);
  }
}

