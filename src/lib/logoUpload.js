import { supabase } from "@/lib/supabaseClient";

const COMPANY_LOGOS_BUCKET = "company-logos";

/** Recommended logo constraints to prevent broken layouts and sharp PDFs */
export const LOGO_CONSTRAINTS = {
  /** Allowed MIME types: JPEG, PNG, SVG (SVG scales crisply in PDFs). */
  ALLOWED_TYPES: ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"],
  /** Max file size in bytes (2MB) — cap uploads; always pair with MIME allowlist (browser `type` is hint-only). */
  MAX_SIZE_BYTES: 2 * 1024 * 1024,
  /** Recommended max width in pixels. Keep under this for sharp PDFs; avoid low-resolution PNGs. */
  RECOMMENDED_WIDTH_PX: 300,
  /** Max width for logo in PDF output (keeps logos sharp; SVG scales perfectly) */
  PDF_LOGO_MAX_WIDTH_PX: 300,
  /** Aspect ratio: flexible (no constraint) */
};

/** e.g. "2MB" for help text next to file inputs */
export function logoMaxSizeLabel() {
  const b = LOGO_CONSTRAINTS.MAX_SIZE_BYTES;
  if (b % (1024 * 1024) === 0) return `${b / (1024 * 1024)}MB`;
  return `${Math.round(b / 1024)}KB`;
}

function logoExtension(file) {
  const m = /\.([^.]+)$/.exec(String(file?.name || "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** True if MIME is allowed, or extension is .png / .jpg / .jpeg / .svg (some browsers omit or misreport type). */
export function isAllowedLogoFileType(file) {
  const t = (file?.type || "").toLowerCase();
  if (LOGO_CONSTRAINTS.ALLOWED_TYPES.includes(t)) return true;
  const ext = logoExtension(file).replace(/[^a-z0-9]/g, "");
  if (ext === "jpeg") return true;
  return ext === "png" || ext === "jpg" || ext === "svg";
}

/**
 * When the browser reports a MIME type, it must be an image family type.
 * (Narrow allowlist in `isAllowedLogoFileType` still applies — this rejects e.g. `application/x-msdownload`.)
 */
export function isImageMimeType(file) {
  const t = (file?.type || "").toLowerCase();
  if (!t) return true;
  return t.includes("image");
}

/** Content-Type for Supabase upload when `file.type` is missing. */
export function inferredLogoContentType(file) {
  const t = (file?.type || "").toLowerCase();
  if (LOGO_CONSTRAINTS.ALLOWED_TYPES.includes(t)) return t;
  const ext = logoExtension(file).replace(/[^a-z0-9]/g, "");
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  return t || undefined;
}

/**
 * Validate a logo file against recommended constraints.
 * @param {File} file
 * @returns {{ valid: true } | { valid: false, message: string }}
 */
export function validateLogoFile(file) {
  if (!file || !(file instanceof File)) {
    return { valid: false, message: "Please select a file." };
  }
  if (!isImageMimeType(file)) {
    return { valid: false, message: "Invalid file type." };
  }
  if (!isAllowedLogoFileType(file)) {
    return { valid: false, message: "Logo must be JPEG, PNG, or SVG." };
  }
  if (file.size > LOGO_CONSTRAINTS.MAX_SIZE_BYTES) {
    const maxMb = LOGO_CONSTRAINTS.MAX_SIZE_BYTES / (1024 * 1024);
    return {
      valid: false,
      message: `Logo must be ${maxMb}MB or smaller.`,
    };
  }
  return { valid: true };
}

/**
 * Upload a logo file to the company-logos bucket and return its storage file name.
 * Save only this value to profiles.logo_url (for example: logo-<user-id>.png).
 * Validates format (JPEG, PNG, or SVG) and max size (2MB) before upload.
 *
 * @param {File} file - Logo image file (JPEG, PNG, or SVG, max 2MB)
 * @param {string} companyId - Company or profile id (e.g. user id or org id) used in the stored filename
 * @returns {Promise<string>} Storage file name of the uploaded logo
 * @throws {Error} If validation or upload fails
 */
export async function uploadLogo(file, companyId) {
  void companyId;
  const validation = validateLogoFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  let ext = logoExtension(file).replace(/[^a-z0-9]/g, "");
  if (ext === "jpeg") ext = "jpg";
  if (!["png", "jpg", "svg"].includes(ext)) {
    const ct = inferredLogoContentType(file);
    ext = ct === "image/svg+xml" ? "svg" : ct === "image/jpeg" || ct === "image/jpg" ? "jpg" : "png";
  }
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `logo-${unique}.${ext}`;

  const { error } = await supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .upload(fileName, file, {
      upsert: true,
      contentType: inferredLogoContentType(file) || file.type || undefined,
    });

  if (error) throw error;

  return fileName;
}

/**
 * Upload a logo used only for a specific invoice/quote (does not replace profile logo).
 * Stored under `document-logos/{userId}/{uuid}.{ext}` in the company-logos bucket.
 *
 * @param {File} file
 * @param {string} userId - auth user id
 * @returns {Promise<string>} Storage path under company-logos bucket
 */
export async function uploadDocumentLogo(file, userId) {
  const validation = validateLogoFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  const uid = String(userId || "").trim();
  if (!uid) {
    throw new Error("You must be signed in to upload a document logo.");
  }

  let ext = logoExtension(file).replace(/[^a-z0-9]/g, "");
  if (ext === "jpeg") ext = "jpg";
  if (!["png", "jpg", "svg"].includes(ext)) {
    const ct = inferredLogoContentType(file);
    ext = ct === "image/svg+xml" ? "svg" : ct === "image/jpeg" || ct === "image/jpg" ? "jpg" : "png";
  }
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `document-logos/${uid}/${unique}.${ext}`;

  const { error } = await supabase.storage.from(COMPANY_LOGOS_BUCKET).upload(fileName, file, {
    upsert: true,
    contentType: inferredLogoContentType(file) || file.type || undefined,
  });

  if (error) throw error;

  return fileName;
}
