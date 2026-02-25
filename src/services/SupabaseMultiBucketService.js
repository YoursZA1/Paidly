import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

/**
 * Generic upload function for any bucket
 * @param {File|Blob} file - The file to upload
 * @param {string} bucket - The bucket name (e.g. 'invoices')
 * @param {string} path - The path/key inside the bucket (e.g. 'userId/invoice123.pdf')
 * @returns {Promise<string>} - The public URL or storage path
 */
export async function uploadToBucket(file, bucket, path) {
  const finalBucket = bucket || import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "invoicebreek";
  try {
    const { error } = await supabase.storage.from(finalBucket).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined
    });
    if (error) throw new Error(getSupabaseErrorMessage(error, "Upload failed"));
    const { data } = supabase.storage.from(finalBucket).getPublicUrl(path);
    return data?.publicUrl || path;
  } catch (err) {
    const message = err instanceof Error ? err.message : getSupabaseErrorMessage(err, "Upload failed");
    throw new Error(message);
  }
}

// Usage examples:
// import { uploadToBucket } from '@/services/SupabaseMultiBucketService';
//
// await uploadToBucket(file, 'invoices', `${userId}/invoice123.pdf`);
// await uploadToBucket(file, 'customers', `${userId}/kyc/passport.jpg`);
// await uploadToBucket(file, 'products-services', `${userId}/productA/image.png`);
// await uploadToBucket(file, 'quotes', `${userId}/quote456.pdf`);
// await uploadToBucket(file, 'payroll', `${userId}/2026-02/payslip.pdf`);
// await uploadToBucket(file, 'bank-details', `${userId}/bank-statement.pdf`);
// await uploadToBucket(file, 'activities', `${userId}/export-2026-02-10.csv`);
// await uploadToBucket(file, 'profile-logos', `${userId}/logo.png`);
