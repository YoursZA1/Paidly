import { supabase } from "@/lib/supabaseClient";

const LOGO_BUCKET = "paidly";
const FALLBACK_LOGO = "/fallback-logo.png";

function extractAfterBucket(url, bucket) {
  const marker = `/${bucket}/`;
  const idx = String(url || "").indexOf(marker);
  if (idx < 0) return null;
  return String(url).slice(idx + marker.length).split("?")[0].split("#")[0] || null;
}

function cleanPath(path) {
  if (!path) return null;
  const raw = String(path).trim();
  if (!raw) return null;
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const fromPaidly = extractAfterBucket(raw, LOGO_BUCKET);
    return fromPaidly || null;
  }
  return raw
    .replace(/^storage\/v1\/object\/public\/paidly\//, "")
    .replace(/^storage\/v1\/object\/sign\/paidly\//, "")
    .replace(/^public\/paidly\//, "")
    .replace(/^sign\/paidly\//, "")
    .replace(/^paidly\//, "");
}

function getLogo(path) {
  const cleaned = cleanPath(path);
  if (!cleaned) return FALLBACK_LOGO;
  if (cleaned.startsWith("blob:") || cleaned.startsWith("data:")) return cleaned;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(cleaned);
  return data?.publicUrl || FALLBACK_LOGO;
}

async function listLogoAssets(limit = 100) {
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).list("", { limit });
  if (error) throw error;
  return data || [];
}

const AssetService = {
  BUCKET: LOGO_BUCKET,
  FALLBACK_LOGO,
  cleanPath,
  getLogo,
  listLogoAssets,
};

export default AssetService;
export { cleanPath, getLogo };
