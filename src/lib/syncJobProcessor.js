import { Client, Invoice } from "@/api/entities";
import { sendInvoiceToClient } from "@/services/InvoiceSendService";

export const SYNC_JOB_TYPES = {
  CREATE_INVOICE: "CREATE_INVOICE",
  SEND_INVOICE: "SEND_INVOICE",
  UPDATE_CLIENT: "UPDATE_CLIENT",
};

export async function processSyncJob(job) {
  switch (job.type) {
    case SYNC_JOB_TYPES.CREATE_INVOICE: {
      const created = await Invoice.create(job.payload?.invoiceData || {});
      return { id: created?.id || null };
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
      const updated = await Client.update(clientId, job.payload?.clientData || {});
      return { id: updated?.id || clientId };
    }
    default:
      throw new Error(`Unsupported sync job type: ${job.type}`);
  }
}

