import { User } from "@/api/entities";
import { uploadLogo } from "@/lib/logoUpload";

/**
 * Uploads the logo file to the company-logos bucket and updates profiles.logo_url with the stored file name.
 * @param {File} logoFile - The logo file to upload
 * @param {Object} form - The form state containing business info
 * @returns {Promise<string>} - The stored logo path (e.g. logo-<user-id>.png)
 */
export async function uploadAndSaveLogo(logoFile, form) {
  if (!logoFile) return form.logo_url || "";
  const user = await User.me();
  const storedLogoPath = await uploadLogo(logoFile, user.id);
  await User.updateMyUserData({
    logo_url: storedLogoPath,
    company_name: form.businessName,
    company_address: form.country,
  });
  return storedLogoPath;
}
