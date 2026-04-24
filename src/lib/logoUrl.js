import { supabase } from "@/lib/supabaseClient";

const COMPANY_LOGOS_BUCKET = "company-logos";

function isFullUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isInlineImage(value) {
  return value.startsWith("blob:") || value.startsWith("data:");
}

function stripQueryAndHash(value) {
  return String(value || "").split("#")[0].split("?")[0];
}

function extractCompanyLogoPathFromPublicUrl(value) {
  const clean = stripQueryAndHash(value);
  const marker = "/storage/v1/object/public/company-logos/";
  const idx = clean.indexOf(marker);
  if (idx < 0) return null;
  const path = clean.slice(idx + marker.length);
  return path || null;
}

function shouldResolveAsCompanyLogoPath(value) {
  return (
    value.startsWith("logo-") ||
    value.startsWith("document-logos/") ||
    value.startsWith("company-logos/")
  );
}

export function cleanLogoPath(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value) return null;

  if (value.includes("http")) {
    const raw = value.split("/company-logos/")[1] || "";
    return raw ? raw.split("?")[0] : null;
  }

  return value;
}

export function getLogoUrl(path) {
  if (!path) return null;

  const value = cleanLogoPath(path);
  if (!value) return null;
  if (isInlineImage(value) || value.includes("/storage/v1/object/sign/")) return value;

  const publicPath = extractCompanyLogoPathFromPublicUrl(value);
  const normalizedPath = (publicPath || value).replace(/^company-logos\//, "");

  if (!shouldResolveAsCompanyLogoPath(normalizedPath) && !publicPath && isFullUrl(value)) {
    return value;
  }

  const { data } = supabase.storage.from(COMPANY_LOGOS_BUCKET).getPublicUrl(normalizedPath);
  return data?.publicUrl || null;
}

export const resolveLogoUrl = getLogoUrl;
