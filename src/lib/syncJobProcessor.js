import { Client, Invoice } from "@/api/entities";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";
import { syncMutationCoordinator } from "@/lib/syncMutationCoordinator";

export const SYNC_JOB_TYPES = {
  CREATE_INVOICE: "CREATE_INVOICE",
  SEND_INVOICE: "SEND_INVOICE",
  UPDATE_CLIENT: "UPDATE_CLIENT",
};

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
    case SYNC_JOB_TYPES.SEND_INVOICE: {
      const invoiceId = job.payload?.invoiceId;
      if (!invoiceId) throw new Error("Missing invoiceId for SEND_INVOICE");
      const result = await sendInvoiceToClient(invoiceId, job.payload?.options || {});
      return result || { invoiceId };
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

