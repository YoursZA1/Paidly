import AssetService from "@/services/AssetService";

export function cleanLogoPath(url) {
  return AssetService.cleanPath(url);
}

export function getLogoUrl(path) {
  return AssetService.getLogo(path);
}

export const resolveLogoUrl = getLogoUrl;
