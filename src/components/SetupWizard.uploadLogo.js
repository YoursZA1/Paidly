import { User } from "@/api/entities";
import { uploadLogo } from "@/lib/logoUpload";

/**
 * Uploads the logo file to the paidly bucket and updates profiles.logo_url with the stored file name.
 * @param {File} logoFile - The logo file to upload
 * @param {Object} form - The form state containing business info
 * @param {string} userId - Current authenticated user id
 * @returns {Promise<string>} - The stored logo path (e.g. logo-<user-id>.png)
 */
export async function uploadAndSaveLogo(logoFile, form, userId) {
  if (!logoFile) return form.logo_url || "";
  if (!userId) return form.logo_url || "";
  const storedLogoPath = await uploadLogo(logoFile, userId);
  await User.updateMyUserData({
    logo_url: storedLogoPath,
    company_name: form.businessName,
    company_address: form.country,
  });
  return storedLogoPath;
}
