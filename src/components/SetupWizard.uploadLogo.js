import { User } from "@/api/entities";
import { uploadLogo } from "@/lib/logoUpload";

/**
 * Uploads the logo file to the company-logos bucket and updates the user profile (profiles.logo_url).
 * @param {File} logoFile - The logo file to upload
 * @param {Object} form - The form state containing business info
 * @returns {Promise<string>} - The public URL of the uploaded logo
 */
export async function uploadAndSaveLogo(logoFile, form) {
  if (!logoFile) return form.logo_url || "";
  const user = await User.me();
  const publicUrl = await uploadLogo(logoFile, user.id);
  await User.updateMyUserData({
    logo_url: publicUrl,
    company_name: form.businessName,
    company_address: form.country,
  });
  return publicUrl;
}
