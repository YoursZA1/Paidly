import { createPageUrl } from "@/utils";
import { getTypeDef } from "./documentCatalog";
import { DocumentService } from "@/services/DocumentService";
import { assertHubWritableType } from "./documentSystemOfRecord";

/** Resolve back link from router location state (set when opening create from Documents hub). */
export function documentsReturnPath(location, fallback = createPageUrl("Documents")) {
  const fromState = location?.state?.returnTo;
  return typeof fromState === "string" && fromState.trim() ? fromState : fallback;
}

/** Whether this catalog type uses an approval workflow (draft → pending). */
export function isApprovalFlowType(typeKey) {
  return getTypeDef(typeKey)?.flow === "approval";
}

/**
 * Create a hub document and optionally advance to pending for approval flows.
 * @param {Parameters<DocumentService["create"]>[0]} payload
 * @param {{ submitForApproval?: boolean }} [options]
 */
export async function persistNewHubDocument(payload, { submitForApproval = false } = {}) {
  assertHubWritableType(payload?.type);
  const doc = await DocumentService.create(payload);
  if (!doc?.id || !submitForApproval) return doc;
  await DocumentService.update(doc.id, { status: "pending" });
  return DocumentService.get(doc.id);
}

/** Navigate target after a successful create from a compose page. */
export function afterCreateNavigateTarget(doc, { returnTo, openDetail = true }) {
  if (openDetail && doc?.id) {
    return `${createPageUrl("Documents")}/${encodeURIComponent(doc.id)}`;
  }
  return returnTo || createPageUrl("Documents");
}
