import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { getBackendBaseUrl } from "@/api/backendClient";
import { DEFAULT_STORAGE_BUCKET } from "@/constants/storageBucket";
import {
  validateActivitiesUpload,
  validateBankDetailsUpload,
  validateBrandingUpload,
  validatePrivateUpload,
  validateReceiptUpload,
} from "@/utils/fileUploadValidation";
import { readStoredAuthUser } from "@/utils/authStorage";
import { apiRequest } from "@/utils/apiRequest";
import {
  runOrgBootstrapWithLock,
  getOrgBootstrapCircuitOpenUntil,
  recordOrgBootstrapFailure,
} from "@/lib/orgBootstrapApi";
import { beginCriticalSessionOperation, endCriticalSessionOperation } from "@/lib/sessionTimeoutControls";
import { getSessionWithRetry, isSupabaseAuthUuid } from "@/api/auth/authSessionHelpers.js";
import { fetchPrimaryMembershipOrgId } from "@/api/auth/orgCache.js";

export class IntegrationManager {
  constructor() {
    const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET;

    const getLocalUserId = () => {
      try {
        const stored = readStoredAuthUser();
        return stored?.id || null;
      } catch {
        return null;
      }
    };

    const getSessionUser = async () => {
      const { data, error } = await getSessionWithRetry();
      if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to get session"));
      return data?.session?.user ?? null;
    };

    const getOrgIdForUser = async (userId) => {
      if (!userId || !isSupabaseAuthUuid(String(userId))) {
        throw new Error("Invalid user id for organization resolution.");
      }

      let orgId = await fetchPrimaryMembershipOrgId(userId);
      if (orgId) return orgId;

      if (getOrgBootstrapCircuitOpenUntil(userId) > Date.now()) {
        throw new Error(
          "Organization bootstrap is cooling down after repeated errors. Please retry in a moment."
        );
      }

      const { data: sd } = await getSessionWithRetry();
      if (!sd?.session?.access_token) {
        throw new Error("Organization setup requires an authenticated session.");
      }

      try {
        await runOrgBootstrapWithLock(userId, {
          getExistingOrgId: () => fetchPrimaryMembershipOrgId(userId),
        });
      } catch (err) {
        console.warn("IntegrationManager: bootstrap failed", err?.message || err);
        throw new Error(`Failed to resolve organization: ${err?.message || err}`);
      }

      orgId = await fetchPrimaryMembershipOrgId(userId);
      if (orgId) return orgId;

      recordOrgBootstrapFailure(userId);
      throw new Error("Organization membership missing after server bootstrap.");
    };

    const buildUploadPath = (orgId, file, folder = "uploads") => {
      const safeName = file?.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, "_") : "upload";
      return `${orgId}/${folder}/${Date.now()}-${safeName}`;
    };

    const buildFileUrl = async ({ filePath, preferSigned }) => {
      void preferSigned;
      const { data: publicData } = supabase
        .storage
        .from(storageBucket)
        .getPublicUrl(filePath);

      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }
      return null;
    };

    const guardUploadByFolder = (file, folder) => {
      const f = folder || "uploads";
      if (f === "branding") {
        validateBrandingUpload(file);
      } else if (f === "activities") {
        validateActivitiesUpload(file);
      } else if (f === "bank-details") {
        validateBankDetailsUpload(file);
      } else if (f === "private") {
        validatePrivateUpload(file);
      } else {
        validateActivitiesUpload(file);
      }
    };

    const uploadToStorage = async ({ file, folder, bucket: bucketOverride }) => {
      beginCriticalSessionOperation();
      try {
      if (!file) {
        throw new Error("No file provided");
      }
      guardUploadByFolder(file, folder);
      const bucket = bucketOverride || storageBucket;

      const sessionUser = await getSessionUser();
      const orgId = sessionUser?.id
        ? await getOrgIdForUser(sessionUser.id)
        : `local-${getLocalUserId() || "guest"}`;
      const filePath = buildUploadPath(orgId, file, folder);

      const { error: uploadError } = await supabase
        .storage
        .from(bucket)
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || undefined
        });

      if (uploadError) {
        throw new Error(getSupabaseErrorMessage(uploadError, "File upload failed"));
      }

      const fileUrl = bucketOverride
        ? await buildFileUrlWithBucket({ filePath, preferSigned: !!sessionUser?.id }, bucket)
        : await buildFileUrl({ filePath, preferSigned: !!sessionUser?.id });

      if (!fileUrl) {
        throw new Error(`Upload succeeded but no file URL was generated. Configure the ${bucket} bucket as public or allow signed URLs.`);
      }

      return { file_url: fileUrl, file_path: filePath };
      } finally {
        endCriticalSessionOperation();
      }
    };

    const buildFileUrlWithBucket = async (opts, bucketName) => {
      const { filePath, preferSigned } = opts;
      void preferSigned;
      const b = bucketName || storageBucket;
      const { data: publicData } = supabase.storage.from(b).getPublicUrl(filePath);
      if (publicData?.publicUrl) return publicData.publicUrl;
      return null;
    };

    this.Core = {
      InvokeLLM: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('InvokeLLM not implemented in custom client');
        return null;
      },
      SendEmail: async (emailConfig) => {
        const { to, subject, body } = emailConfig || {};
        if (!to || !subject) {
          throw new Error("Missing to or subject");
        }
        try {
          const { data: sessionData } = await getSessionWithRetry();
          const token = sessionData?.session?.access_token;
          if (!token) {
            throw new Error("Not signed in");
          }
          const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
          const res = await apiRequest(`${apiBase}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to, subject, body: body || "" }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(json?.error || res.statusText || "Send failed");
          }
          if (json.success === false) {
            throw new Error(json?.error || "Send failed");
          }
          return { success: true, data: json.data };
        } catch (err) {
          console.error("SendEmail error:", err);
          throw err instanceof Error ? err : new Error(err?.message || String(err));
        }
      },
      UploadFile: async ({ file }) => {
        return uploadToStorage({ file, folder: "branding" });
      },
      /** Upload to activities bucket (receipts, attachments); path = org_id/activities/... */
      UploadToActivities: async ({ file }) => {
        return uploadToStorage({ file, folder: "activities", bucket: "activities" });
      },
      /** Store receipt image in receipts bucket: receipt-{Date.now()}.{ext} under org_id */
      UploadToReceipts: async ({ file }) => {
        beginCriticalSessionOperation();
        try {
        if (!file) throw new Error("No file provided");
        validateReceiptUpload(file);
        const sessionUser = await getSessionUser();
        const orgId = sessionUser?.id
          ? await getOrgIdForUser(sessionUser.id)
          : `local-${getLocalUserId() || "guest"}`;
        const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "jpg");
        const filePath = `${orgId}/receipt-${Date.now()}.${ext}`;
        const bucket = "receipts";
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) {
          throw new Error(getSupabaseErrorMessage(uploadError, "Receipt upload failed"));
        }
        const fileUrl = await buildFileUrlWithBucket({ filePath, preferSigned: !!sessionUser?.id }, bucket);
        if (!fileUrl) {
          throw new Error("Receipt upload succeeded but could not generate URL.");
        }
        return { file_url: fileUrl, file_path: filePath };
        } finally {
          endCriticalSessionOperation();
        }
      },
      /** Upload to bank-details bucket (statements, imports); path = org_id/bank-details/... */
      UploadToBankDetails: async ({ file }) => {
        return uploadToStorage({ file, folder: "bank-details", bucket: "bank-details" });
      },
      GenerateImage: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('GenerateImage not implemented in custom client');
        return null;
      },
      ExtractDataFromUploadedFile: async (file) => {
        void file; // Acknowledge parameter
        // This integration requires a backend/LLM service. In the custom client build, it isn't configured.
        // Callers should fall back to browser OCR (images) or manual entry.
        throw new Error("Receipt extraction service is not configured. Enable 'Extract with browser OCR' (images only) or fill in manually.");
      },
      CreateFileSignedUrl: async (fileId) => {
        void fileId; // Acknowledge parameter
        console.warn('CreateFileSignedUrl not implemented in custom client');
        return null;
      },
      UploadPrivateFile: async ({ file }) => {
        console.log('UploadPrivateFile called with file:', file?.name);
        return uploadToStorage({ file, folder: "private" });
      }
    };
  }
}
