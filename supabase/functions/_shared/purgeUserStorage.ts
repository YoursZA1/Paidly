import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Remove Storage objects tied to an auth user (same paths as server/src/purgeUserStorage.js).
 */
export async function purgeUserStorageAssets(admin: SupabaseClient, userId: string): Promise<void> {
  const uid = String(userId || "").trim();
  if (!uid) return;

  const removeQuiet = async (bucket: string, paths: string[]) => {
    if (!paths.length) return;
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) {
      console.warn(`[purge-user-storage] remove failed bucket=${bucket}`, error.message);
    }
  };

  try {
    const { data: profileFiles, error: profileListErr } = await admin.storage.from("profile-logos").list(uid);
    if (profileListErr) {
      console.warn("[purge-user-storage] list profile-logos", profileListErr.message);
    } else if (profileFiles?.length) {
      const paths = profileFiles.filter((f) => f?.name).map((f) => `${uid}/${f.name}`);
      await removeQuiet("profile-logos", paths);
    }
  } catch (e) {
    console.warn("[purge-user-storage] profile-logos exception", e);
  }

  const companyBucket = "company-logos";
  const rootLogoPaths = ["png", "jpg", "jpeg", "svg"].map((ext) => `logo-${uid}.${ext}`);
  await removeQuiet(companyBucket, rootLogoPaths);

  try {
    const docPrefix = `document-logos/${uid}`;
    const { data: docFiles, error: docListErr } = await admin.storage.from(companyBucket).list(docPrefix);
    if (docListErr) {
      console.warn("[purge-user-storage] list document-logos", docListErr.message);
    } else if (docFiles?.length) {
      const paths = docFiles.filter((f) => f?.name).map((f) => `${docPrefix}/${f.name}`);
      await removeQuiet(companyBucket, paths);
    }
  } catch (e) {
    console.warn("[purge-user-storage] document-logos exception", e);
  }
}
