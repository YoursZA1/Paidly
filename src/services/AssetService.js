import { supabase } from "@/lib/supabaseClient";
import {
  isStorageAssetKnownFailed,
  isValidLogoStorageObjectKey,
  markStorageAssetFailed,
} from "@/lib/paidlyStorageAssetGuard";
import { readLogoUrlDiskCache, writeLogoUrlDiskCache } from "@/lib/logoUrlDiskCache";

const LOGO_BUCKET = "paidly";
const LEGACY_LOGO_BUCKET = "company-logos";
/** Pre-standardization bucket for read-only `{userId}/logo.ext` paths (no new uploads). */
const LEGACY_PROFILE_LOGOS_BUCKET = "profile-logos";
const FALLBACK_LOGO = "/fallback-logo.png";

function isLegacyProfileLogoPath(cleaned) {
  return /^[^/]+\/logo\.[a-z0-9]+$/i.test(String(cleaned || ""));
}

/** In-memory resolved public URLs per profile path (session); avoids repeat getPublicUrl + disk reads). */
const SESSION_LOGO_BY_INPUT = new Map();
const SESSION_LOGO_MAX = 500;

function touchSessionLogoMap(key, value) {
  if (SESSION_LOGO_BY_INPUT.size >= SESSION_LOGO_MAX && !SESSION_LOGO_BY_INPUT.has(key)) {
    const first = SESSION_LOGO_BY_INPUT.keys().next().value;
    if (first != null) SESSION_LOGO_BY_INPUT.delete(first);
  }
  SESSION_LOGO_BY_INPUT.set(key, value);
}

function extractAfterBucket(url, bucket) {
  const marker = `/${bucket}/`;
  const idx = String(url || "").indexOf(marker);
  if (idx < 0) return null;
  return String(url).slice(idx + marker.length).split("?")[0].split("#")[0] || null;
}

function resolveBucketAndPathFromUrl(url) {
  const raw = String(url || "");
  const paidlyMarker = `/${LOGO_BUCKET}/`;
  const legacyMarker = `/${LEGACY_LOGO_BUCKET}/`;
  const paidlyIdx = raw.indexOf(paidlyMarker);
  const legacyIdx = raw.indexOf(legacyMarker);

  if (paidlyIdx < 0 && legacyIdx < 0) {
    return { bucket: null, cleaned: null };
  }

  if (paidlyIdx >= 0 && (legacyIdx < 0 || paidlyIdx <= legacyIdx)) {
    return { bucket: LOGO_BUCKET, cleaned: extractAfterBucket(raw, LOGO_BUCKET) };
  }
  return { bucket: LEGACY_LOGO_BUCKET, cleaned: extractAfterBucket(raw, LEGACY_LOGO_BUCKET) };
}

function resolveLogoSource(path) {
  if (!path) return { bucket: LOGO_BUCKET, cleaned: null };
  const raw = String(path).trim();
  if (!raw) return { bucket: LOGO_BUCKET, cleaned: null };
  if (raw.startsWith("blob:") || raw.startsWith("data:")) {
    return { bucket: LOGO_BUCKET, cleaned: raw };
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const resolved = resolveBucketAndPathFromUrl(raw);
    return { bucket: resolved.bucket || LOGO_BUCKET, cleaned: resolved.cleaned || null };
  }

  const lower = raw.toLowerCase();
  let bucket = LOGO_BUCKET;
  if (
    lower.startsWith("storage/v1/object/public/company-logos/") ||
    lower.startsWith("storage/v1/object/sign/company-logos/") ||
    lower.startsWith("public/company-logos/") ||
    lower.startsWith("sign/company-logos/") ||
    lower.startsWith("company-logos/")
  ) {
    bucket = LEGACY_LOGO_BUCKET;
  } else if (
    lower.startsWith("storage/v1/object/public/profile-logos/") ||
    lower.startsWith("storage/v1/object/sign/profile-logos/") ||
    lower.startsWith("public/profile-logos/") ||
    lower.startsWith("sign/profile-logos/") ||
    lower.startsWith("profile-logos/")
  ) {
    bucket = LEGACY_PROFILE_LOGOS_BUCKET;
  }

  const cleaned = raw
    .replace(/^storage\/v1\/object\/public\/paidly\//, "")
    .replace(/^storage\/v1\/object\/sign\/paidly\//, "")
    .replace(/^storage\/v1\/object\/public\/company-logos\//, "")
    .replace(/^storage\/v1\/object\/sign\/company-logos\//, "")
    .replace(/^public\/paidly\//, "")
    .replace(/^sign\/paidly\//, "")
    .replace(/^public\/company-logos\//, "")
    .replace(/^sign\/company-logos\//, "")
    .replace(/^paidly\//, "")
    .replace(/^company-logos\//, "")
    .replace(/^profile-logos\//, "");

  if (cleaned && bucket === LOGO_BUCKET && isLegacyProfileLogoPath(cleaned)) {
    bucket = LEGACY_PROFILE_LOGOS_BUCKET;
  }

  return { bucket, cleaned: cleaned || null };
}

function cleanPath(path) {
  return resolveLogoSource(path).cleaned;
}

function detectLogoBucket(path) {
  return resolveLogoSource(path).bucket;
}

function getLogo(path) {
  const rawInput = String(path || "").trim();
  const { bucket, cleaned } = resolveLogoSource(path);
  if (!cleaned) return FALLBACK_LOGO;
  if (cleaned.startsWith("blob:") || cleaned.startsWith("data:")) return cleaned;
  if (!isValidLogoStorageObjectKey(cleaned)) return FALLBACK_LOGO;

  if (rawInput && !rawInput.startsWith("blob:") && !rawInput.startsWith("data:")) {
    const mem = SESSION_LOGO_BY_INPUT.get(rawInput);
    if (mem && mem !== FALLBACK_LOGO && !isStorageAssetKnownFailed(mem)) {
      return mem;
    }
  }

  if (rawInput && !rawInput.startsWith("blob:") && !rawInput.startsWith("data:")) {
    const disk = readLogoUrlDiskCache(rawInput);
    if (disk?.url && disk.url !== FALLBACK_LOGO && !isStorageAssetKnownFailed(disk.url)) {
      touchSessionLogoMap(rawInput, disk.url);
      return disk.url;
    }
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(cleaned);
  const url = data?.publicUrl || FALLBACK_LOGO;
  if (url !== FALLBACK_LOGO && isStorageAssetKnownFailed(url)) return FALLBACK_LOGO;
  if (url !== FALLBACK_LOGO && rawInput && !rawInput.startsWith("blob:") && !rawInput.startsWith("data:")) {
    writeLogoUrlDiskCache(rawInput, url);
    touchSessionLogoMap(rawInput, url);
  }
  return url;
}

async function listLogoAssets(limit = 100) {
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).list("", { limit });
  if (error) throw error;
  return data || [];
}

/**
 * Authenticated Settings/private preview only. Public invoices must use getLogo()
 * (getPublicUrl on the public paidly bucket) — never this helper.
 */
async function signLogoUrl(path) {
  const { bucket, cleaned } = resolveLogoSource(path);
  if (!cleaned || cleaned.startsWith("blob:") || cleaned.startsWith("data:")) return FALLBACK_LOGO;
  if (!isValidLogoStorageObjectKey(cleaned)) return FALLBACK_LOGO;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleaned, 60 * 60);
  if (error || !data?.signedUrl) return FALLBACK_LOGO;
  return data.signedUrl;
}

function clearLogoSessionCache() {
  SESSION_LOGO_BY_INPUT.clear();
}

/**
 * Remove a logo object from storage. Ignores missing files.
 * @param {string} path
 */
async function deleteLogo(path) {
  const { bucket, cleaned } = resolveLogoSource(path);
  if (!cleaned || cleaned.startsWith("blob:") || cleaned.startsWith("data:")) return;
  if (!isValidLogoStorageObjectKey(cleaned)) return;
  const { error } = await supabase.storage.from(bucket).remove([cleaned]);
  if (error && !/not found|NoSuchKey|404/i.test(error.message || "")) {
    console.warn("[AssetService] Could not delete logo", cleaned, error.message);
  }
}

const AssetService = {
  BUCKET: LOGO_BUCKET,
  FALLBACK_LOGO,
  cleanPath,
  getLogo,
  signLogoUrl,
  deleteLogo,
  listLogoAssets,
  markStorageAssetFailed,
  isValidLogoStorageObjectKey,
  clearLogoSessionCache,
};

export default AssetService;
export {
  cleanPath,
  getLogo,
  signLogoUrl,
  deleteLogo,
  markStorageAssetFailed,
  isValidLogoStorageObjectKey,
  clearLogoSessionCache,
};
