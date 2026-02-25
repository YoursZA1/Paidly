import { User } from "@/api/entities";
import SupabaseStorageService from "@/services/SupabaseStorageService";

/**
 * Uploads the logo file to Supabase and updates the user profile with the logo_url.
 * @param {File} logoFile - The logo file to upload
 * @param {Object} form - The form state containing business info
 * @returns {Promise<string>} - The public URL of the uploaded logo
 */
export async function uploadAndSaveLogo(logoFile, form) {
  if (!logoFile) return form.logo_url || "";
  const user = await User.me();
  const publicUrl = await SupabaseStorageService.uploadProfileLogo(logoFile, user.id);
  await User.updateMyUserData({
    logo_url: publicUrl,
    company_name: form.businessName,
    company_address: form.country,
    // Add other fields as needed
  });
  return publicUrl;
}
