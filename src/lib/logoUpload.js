import { supabase } from "@/lib/supabaseClient";

const COMPANY_LOGOS_BUCKET = "company-logos";

/** Recommended logo constraints to prevent broken layouts and sharp PDFs */
export const LOGO_CONSTRAINTS = {
  /** Allowed MIME types: JPEG, PNG, SVG (SVG scales crisply in PDFs). */
  ALLOWED_TYPES: ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"],
  /** Max file size in bytes (500KB) */
  MAX_SIZE_BYTES: 500 * 1024,
  /** Recommended max width in pixels. Keep under this for sharp PDFs; avoid low-resolution PNGs. */
  RECOMMENDED_WIDTH_PX: 300,
  /** Max width for logo in PDF output (keeps logos sharp; SVG scales perfectly) */
  PDF_LOGO_MAX_WIDTH_PX: 300,
  /** Aspect ratio: flexible (no constraint) */
};

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
  if (!isAllowedLogoFileType(file)) {
    return { valid: false, message: "Logo must be JPEG, PNG, or SVG." };
  }
  if (file.size > LOGO_CONSTRAINTS.MAX_SIZE_BYTES) {
    const maxKB = Math.round(LOGO_CONSTRAINTS.MAX_SIZE_BYTES / 1024);
    return { valid: false, message: `Logo must be under ${maxKB}KB.` };
  }
  return { valid: true };
}

/**
 * Upload a logo file to the company-logos bucket and return its public URL.
 * Save the returned URL to profiles.logo_url (or companies.logo_url if you use a companies table).
 * Validates format (JPEG, PNG, or SVG) and max size (500KB) before upload.
 *
 * @param {File} file - Logo image file (JPEG, PNG, or SVG, max 500KB)
 * @param {string} companyId - Company or profile id (e.g. user id or org id) used in the stored filename
 * @returns {Promise<string>} Public URL of the uploaded logo
 * @throws {Error} If validation or upload fails
 */
export async function uploadLogo(file, companyId) {
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
  const fileName = `logo-${companyId}.${ext}`;

  const { error } = await supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .upload(fileName, file, {
      upsert: true,
      contentType: inferredLogoContentType(file) || file.type || undefined,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}
