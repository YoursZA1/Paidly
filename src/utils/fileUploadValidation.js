/**
 * Client-side upload checks before Supabase Storage (defense in depth).
 */

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  branding: { maxBytes: 8 * MB },
  activities: { maxBytes: 15 * MB },
  receipts: { maxBytes: 10 * MB },
  bankDetails: { maxBytes: 20 * MB },
  private: { maxBytes: 15 * MB },
};

const BRANDING_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const ACTIVITIES_TYPES = new Set([
  ...RECEIPT_TYPES,
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const BANK_TYPES = new Set([...ACTIVITIES_TYPES]);

const PRIVATE_TYPES = new Set([...ACTIVITIES_TYPES]);

const EXT_IMAGE_PDF = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"];
const EXT_ACTIVITIES = [...EXT_IMAGE_PDF, ".csv", ".xls", ".xlsx"];

function extMatches(name, list) {
  const lower = String(name || "").toLowerCase();
  return list.some((ext) => lower.endsWith(ext));
}

/**
 * @param {File|Blob} file
 * @param {{ maxBytes: number, allowedTypes: Set<string>, label?: string, extensionsWhenTypeMissing?: string[] }} opts
 */
export function assertUploadAllowed(file, opts) {
  const {
    maxBytes,
    allowedTypes,
    label = "File",
    extensionsWhenTypeMissing = null,
  } = opts;

  if (!file || typeof file.size !== "number") {
    throw new Error("Invalid file");
  }
  if (file.size <= 0) {
    throw new Error("File is empty");
  }
  if (file.size > maxBytes) {
    throw new Error(`${label} is too large (max ${Math.round(maxBytes / MB)}MB)`);
  }

  if (!allowedTypes?.size) {
    return;
  }

  const t = (file.type || "").trim().toLowerCase();
  if (t && allowedTypes.has(t)) {
    return;
  }

  if (!t && extensionsWhenTypeMissing?.length && "name" in file) {
    if (extMatches(file.name, extensionsWhenTypeMissing)) {
      return;
    }
  }

  throw new Error(`${label} type is not allowed`);
}

export function validateBrandingUpload(file) {
  assertUploadAllowed(file, {
    ...UPLOAD_LIMITS.branding,
    allowedTypes: BRANDING_TYPES,
    label: "Image",
    extensionsWhenTypeMissing: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
  });
}

export function validateActivitiesUpload(file) {
  assertUploadAllowed(file, {
    ...UPLOAD_LIMITS.activities,
    allowedTypes: ACTIVITIES_TYPES,
    label: "File",
    extensionsWhenTypeMissing: EXT_ACTIVITIES,
  });
}

export function validateReceiptUpload(file) {
  assertUploadAllowed(file, {
    ...UPLOAD_LIMITS.receipts,
    allowedTypes: RECEIPT_TYPES,
    label: "Receipt",
    extensionsWhenTypeMissing: EXT_IMAGE_PDF,
  });
}

export function validateBankDetailsUpload(file) {
  assertUploadAllowed(file, {
    ...UPLOAD_LIMITS.bankDetails,
    allowedTypes: BANK_TYPES,
    label: "File",
    extensionsWhenTypeMissing: EXT_ACTIVITIES,
  });
}

export function validatePrivateUpload(file) {
  assertUploadAllowed(file, {
    ...UPLOAD_LIMITS.private,
    allowedTypes: PRIVATE_TYPES,
    label: "File",
    extensionsWhenTypeMissing: EXT_ACTIVITIES,
  });
}
