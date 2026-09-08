/**
 * Shared document context for PDF / send / observe adapters.
 */
export {
  DOCUMENT_ENGINE_TYPES,
  DOCUMENT_ENGINE_CHANNELS,
  DOCUMENT_OBSERVE_ACTION,
  createDocumentContext,
  assertDocumentEngineType,
  normalizeDocumentEngineType,
  isDocumentEngineType,
  pdfArtifactFilename,
  toPdfArtifact,
} from "@shared/documents/documentEngine.js";
