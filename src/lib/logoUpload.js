import { supabase } from "@/lib/supabaseClient";

const COMPANY_LOGOS_BUCKET = "company-logos";

/** Recommended logo constraints to prevent broken layouts and sharp PDFs */
export const LOGO_CONSTRAINTS = {
  /** Allowed MIME types: PNG or SVG. SVG preferred for sharp rendering at any scale in PDFs. */
  ALLOWED_TYPES: ["image/png", "image/svg+xml"],
  /** Max file size in bytes (500KB) */
  MAX_SIZE_BYTES: 500 * 1024,
  /** Recommended max width in pixels. Keep under this for sharp PDFs; avoid low-resolution PNGs. */
  RECOMMENDED_WIDTH_PX: 300,
  /** Max width for logo in PDF output (keeps logos sharp; SVG scales perfectly) */
  PDF_LOGO_MAX_WIDTH_PX: 300,
  /** Aspect ratio: flexible (no constraint) */
};

/**
 * Validate a logo file against recommended constraints.
 * @param {File} file
 * @returns {{ valid: true } | { valid: false, message: string }}
 */
export function validateLogoFile(file) {
  if (!file || !(file instanceof File)) {
    return { valid: false, message: "Please select a file." };
  }
  if (!LOGO_CONSTRAINTS.ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, message: "Logo must be PNG or SVG." };
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
 * Validates format (PNG or SVG) and max size (500KB) before upload.
 *
 * @param {File} file - Logo image file (PNG or SVG, max 500KB)
 * @param {string} companyId - Company or profile id (e.g. user id or org id) used in the stored filename
 * @returns {Promise<string>} Public URL of the uploaded logo
 * @throws {Error} If validation or upload fails
 */
export async function uploadLogo(file, companyId) {
  const validation = validateLogoFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "png");
  const fileName = `logo-${companyId}.${ext}`;

  const { error } = await supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .upload(fileName, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}
