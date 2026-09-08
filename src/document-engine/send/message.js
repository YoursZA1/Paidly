import { DocumentSend, MessageLog } from "@/api/entities";
import { retryOnTransientFetch } from "@/utils/retryOnAbort";

export async function recordDocumentSend(documentType, documentId, clientId, channel) {
  try {
    await DocumentSend.create({
      document_type: documentType,
      document_id: documentId,
      client_id: clientId || null,
      channel: channel === "whatsapp" ? "whatsapp" : "email",
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to record document send:", e);
  }
}

export async function persistDocumentMessageLog({
  documentType,
  documentId,
  clientId = null,
  channel = "email",
  recipient = null,
  trackingToken,
  sentAt,
} = {}) {
  if (!trackingToken) return null;
  return retryOnTransientFetch(() =>
    MessageLog.create({
      document_type: documentType,
      document_id: documentId,
      client_id: clientId || null,
      channel: channel === "whatsapp" ? "whatsapp" : "email",
      recipient: recipient || null,
      sent_at: sentAt || new Date().toISOString(),
      tracking_token: trackingToken,
    })
  );
}
