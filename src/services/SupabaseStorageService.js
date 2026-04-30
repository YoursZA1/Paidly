import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { beginCriticalSessionOperation, endCriticalSessionOperation } from "@/lib/sessionTimeoutControls";

import { DEFAULT_STORAGE_BUCKET } from "@/constants/storageBucket";

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET;
const PROFILE_LOGOS_BUCKET = "profile-logos";

/**
 * Resolve the Supabase auth user id for storage path (RLS requires path = auth.uid()).
 * @param {string} [userId] - Optional id from User.me(); if missing or "anonymous", fetches from session
 * @returns {Promise<string>} Auth user id
 */
async function resolveAuthUserId(userId) {
  if (userId && userId !== "anonymous") return userId;
  const { data } = await supabase.auth.getSession();
  const authId = data?.session?.user?.id;
  if (!authId) {
    throw new Error("You must be logged in to upload a logo. Please sign in and try again.");
  }
  return authId;
}

const SupabaseStorageService = {
  /**
   * Uploads a file to the main storage bucket (default: paidly) and returns a public URL.
   * Uses the main bucket first so it works without listBuckets permission; path must be userId/logo.* for RLS.
   * @param {File} file
   * @param {string} [userId] - Supabase auth user id (optional; resolved from session if missing)
   * @returns {Promise<string>} public URL
   */
  async uploadProfileLogo(file, userId) {
    beginCriticalSessionOperation();
    try {
    const authUserId = await resolveAuthUserId(userId);
    const fileExt = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "png");
    const filePath = `${authUserId}/logo.${fileExt}`;

    // Use main bucket first (default paidly) — matches storage setup SQL and avoids listBuckets
    let bucketToUse = BUCKET;
    let uploadError = null;
    let uploadData = null;

    const { error, data } = await supabase.storage.from(bucketToUse).upload(filePath, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) {
      const msg = getSupabaseErrorMessage(error, "Upload failed");
      if (msg.includes("Bucket not found") || msg.includes("does not exist")) {
        bucketToUse = PROFILE_LOGOS_BUCKET;
        const fallback = await supabase.storage.from(bucketToUse).upload(filePath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });
        if (fallback.error) {
          throw new Error(
            `Storage bucket not found. Create the "${BUCKET}" bucket in Supabase (Storage) or run CREATE_BUCKET_NOW.sql.`
          );
        }
        uploadData = fallback.data;
      } else {
        uploadError = error;
      }
    } else {
      uploadData = data;
    }

    if (uploadError) {
      const rawMsg = getSupabaseErrorMessage(uploadError, "Upload failed");
      if (rawMsg.toLowerCase().includes("policy") || rawMsg.toLowerCase().includes("denied") || rawMsg.toLowerCase().includes("row-level")) {
        throw new Error("Permission denied for logo upload. Ensure storage RLS policies are set up (run CREATE_BUCKET_NOW.sql or CREATE_POLICIES_ONLY.sql in Supabase).");
      }
      throw new Error(`Failed to upload logo: ${rawMsg}`);
    }

    if (uploadData) {
      console.log(`Logo uploaded to bucket: ${bucketToUse}, path: ${filePath}`);
    }

    const { data: publicData } = supabase.storage.from(bucketToUse).getPublicUrl(filePath);
    if (!publicData?.publicUrl) {
      throw new Error("Upload succeeded but could not generate public logo URL.");
    }
    return publicData.publicUrl;
    } finally {
      endCriticalSessionOperation();
    }
  },

  /** Returns a public URL for the provided path. */
  async refreshSignedUrl(filePath, currentUrl) {
    const url = await this.getSignedUrl(filePath);
    return url || currentUrl || "";
  },

  /**
   * Gets a public URL for a file path.
   * Tries profile-logos first when path looks like userId/logo.*, then fallback bucket.
   * @param {string} filePath - The storage path (e.g. "userId/logo.png")
   * @param {string} [bucketHint] - Optional bucket id (e.g. "profile-logos") to try first
   * @returns {Promise<string>} Public URL
   */
  async getSignedUrl(filePath, bucketHint = null) {
    const bucketsToTry = [];
    if (bucketHint) {
      bucketsToTry.push(bucketHint);
    }
    if (/^[^/]+\/logo\./i.test(filePath)) {
      if (!bucketsToTry.includes(PROFILE_LOGOS_BUCKET)) bucketsToTry.push(PROFILE_LOGOS_BUCKET);
    }
    if (!bucketsToTry.includes(BUCKET)) bucketsToTry.push(BUCKET);

    for (const bucket of bucketsToTry) {
      try {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        if (data?.publicUrl) return data.publicUrl;
      } catch (err) {
        console.warn(`getSignedUrl(${bucket}) failed:`, getSupabaseErrorMessage(err, "Get URL failed"));
      }
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || "";
  },
};

export default SupabaseStorageService;
