import { logSecurity } from "./securityMiddleware.js";

/**
 * Best-effort removal of Supabase Storage objects tied to an auth user (profile logos, document logos, company-logos).
 * Call before auth.admin.deleteUser so paths are still predictable.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} adminClient
 * @param {string} userId
 */
export async function purgeUserStorageAssets(adminClient, userId) {
  const uid = String(userId || "").trim();
  if (!uid || !adminClient) return;

  const removeQuiet = async (bucket, paths) => {
    if (!paths.length) return;
    const { error } = await adminClient.storage.from(bucket).remove(paths);
    if (error) {
      logSecurity("warn", "purge_storage_remove_failed", {
        bucket,
        count: paths.length,
        message: error.message,
      });
    }
  };

  try {
    const { data: profileFiles, error: profileListErr } = await adminClient.storage
      .from("profile-logos")
      .list(uid);
    if (profileListErr) {
      logSecurity("warn", "purge_storage_list_failed", {
        bucket: "profile-logos",
        path: uid,
        message: profileListErr.message,
      });
    } else if (profileFiles?.length) {
      const paths = profileFiles.filter((f) => f?.name).map((f) => `${uid}/${f.name}`);
      await removeQuiet("profile-logos", paths);
    }
  } catch (e) {
    logSecurity("warn", "purge_storage_profile_exception", { message: e?.message || String(e) });
  }

  const companyBucket = "company-logos";
  const rootLogoPaths = ["png", "jpg", "jpeg", "svg"].map((ext) => `logo-${uid}.${ext}`);
  await removeQuiet(companyBucket, rootLogoPaths);

  try {
    const docPrefix = `document-logos/${uid}`;
    const { data: docFiles, error: docListErr } = await adminClient.storage
      .from(companyBucket)
      .list(docPrefix);
    if (docListErr) {
      logSecurity("warn", "purge_storage_list_failed", {
        bucket: companyBucket,
        path: docPrefix,
        message: docListErr.message,
      });
    } else if (docFiles?.length) {
      const paths = docFiles.filter((f) => f?.name).map((f) => `${docPrefix}/${f.name}`);
      await removeQuiet(companyBucket, paths);
    }
  } catch (e) {
    logSecurity("warn", "purge_storage_document_logos_exception", { message: e?.message || String(e) });
  }
}
