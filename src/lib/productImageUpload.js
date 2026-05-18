import { supabase } from "@/lib/supabaseClient";
import { inferredLogoContentType } from "@/lib/logoUpload";

const PAIDLY_BUCKET = "paidly";
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Upload a product image to paidly storage.
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<string>} path under paidly bucket (store in services.image_url)
 */
export async function uploadProductImage(file, userId) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("You must be signed in to upload a product image.");

  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 3MB or smaller.");
  }
  const t = (file.type || "").toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  const extOk = /\.(png|jpe?g|webp)$/i.test(file.name || "");
  if (t && !allowed.includes(t) && !extOk) {
    throw new Error("Use PNG, JPEG, or WebP for product images.");
  }

  const ext = (() => {
    const name = String(file.name || "").toLowerCase();
    const m = /\.([a-z0-9]+)$/.exec(name);
    if (m?.[1] === "jpeg") return "jpg";
    if (m?.[1] && ["png", "jpg", "webp"].includes(m[1])) return m[1];
    const ct = inferredLogoContentType(file);
    if (ct === "image/png") return "png";
    if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
    return "png";
  })();

  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `inventory/${uid}/${unique}.${ext}`;

  const { error } = await supabase.storage.from(PAIDLY_BUCKET).upload(fileName, file, {
    upsert: true,
    contentType: inferredLogoContentType(file) || file.type || undefined,
  });
  if (error) throw error;
  return fileName;
}
