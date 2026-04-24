import { useState, useEffect } from "react";
import SupabaseStorageService from "@/services/SupabaseStorageService";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

import { DEFAULT_STORAGE_BUCKET } from "@/constants/storageBucket";

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET;

function parseSignedStoragePath(signedUrl) {
  try {
    const marker = "/object/sign/";
    const idx = String(signedUrl || "").indexOf(marker);
    if (idx < 0) return null;
    const rest = signedUrl.slice(idx + marker.length).split("?")[0];
    const decoded = decodeURIComponent(rest || "");
    const slashIdx = decoded.indexOf("/");
    if (slashIdx <= 0) return null;
    return {
      bucket: decoded.slice(0, slashIdx),
      filePath: decoded.slice(slashIdx + 1),
    };
  } catch {
    return null;
  }
}

/**
 * LogoImage component that handles Supabase signed URLs and auto-refreshes expired ones
 * @param {string} src - The logo URL (can be signed URL, public URL, or storage path)
 * @param {string} alt - Alt text for the image
 * @param {string} className - CSS classes
 * @param {object} style - Inline styles
 * @param {boolean} fallbackToPublic - Whether to fallback to public URL if signed URL fails
 */
export default function LogoImage({ 
  src, 
  alt = "Logo", 
  className = "", 
  style = {},
  fallbackToPublic = true 
}) {
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!src) {
      setHasError(true);
      setIsLoading(false);
      setImageSrc("");
      return;
    }

    // New `src` must clear prior failure/loading state — otherwise a logo change never renders
    // (preview stays blank and html2pdf capture can fail after swapping URLs).
    setHasError(false);
    setIsLoading(true);

    // If it's a blob URL or data URL, use it directly
    if (src.startsWith('blob:') || src.startsWith('data:')) {
      setImageSrc(src);
      setIsLoading(false);
      return;
    }

    // If it's already a full URL (http/https), use it directly
    if (src.startsWith('http://') || src.startsWith('https://')) {
      // Check if it's a signed URL that might be expired
      if (src.includes('supabase.co/storage/v1/object/sign/')) {
        // Try to load the image, if it fails, refresh the signed URL
        const img = new Image();
        img.onload = () => {
          setImageSrc(src);
          setIsLoading(false);
        };
        img.onerror = async () => {
          // Signed URL expired, try to extract path and refresh
          try {
            const parsed = parseSignedStoragePath(src);
            if (parsed?.filePath) {
              const refreshedUrl = await SupabaseStorageService.getSignedUrl(parsed.filePath, parsed.bucket);
              if (refreshedUrl) {
                setImageSrc(refreshedUrl);
                setIsLoading(false);
                return;
              }
            }
          } catch (error) {
            console.warn("LogoImage: refresh signed URL failed", getSupabaseErrorMessage(error, "Refresh URL failed"));
          }
          if (fallbackToPublic) {
            try {
              const parsed = parseSignedStoragePath(src);
              if (parsed?.filePath) {
                const { data } = supabase.storage.from(parsed.bucket || BUCKET).getPublicUrl(parsed.filePath);
                if (data?.publicUrl) {
                  setImageSrc(data.publicUrl);
                  setIsLoading(false);
                  return;
                }
              }
            } catch (err) {
              console.warn("LogoImage: get public URL failed", getSupabaseErrorMessage(err, "Get URL failed"));
            }
          }
          
          setHasError(true);
          setIsLoading(false);
        };
        img.src = src;
      } else {
        // Regular URL, use directly (public bucket URLs, CDNs, etc.)
        setImageSrc(src);
        setIsLoading(false);
      }
    } else {
      // Assume it's a storage path, get signed URL
      (async () => {
        try {
          const signedUrl = await SupabaseStorageService.getSignedUrl(src);
          if (signedUrl) {
            setImageSrc(signedUrl);
            setIsLoading(false);
          } else {
            setHasError(true);
            setIsLoading(false);
          }
        } catch (error) {
          console.warn("LogoImage: get signed URL failed", getSupabaseErrorMessage(error, "Get URL failed"));
          setHasError(true);
          setIsLoading(false);
        }
      })();
    }
  }, [src, fallbackToPublic]);

  if (hasError || !imageSrc) {
    return null; // Or return a placeholder icon
  }

  if (isLoading) {
    return (
      <div className={`bg-gray-100 animate-pulse ${className}`} style={style} />
    );
  }

  // html2canvas needs CORS-safe images; limit to Supabase storage so other hosts still load without CORS.
  const needsCorsForCapture =
    typeof imageSrc === "string" &&
    imageSrc.includes("supabase.co") &&
    (imageSrc.startsWith("https://") || imageSrc.startsWith("http://"));

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      style={style}
      {...(needsCorsForCapture ? { crossOrigin: "anonymous" } : {})}
      onError={() => {
        setHasError(true);
        setIsLoading(false);
      }}
      onLoad={() => {
        setIsLoading(false);
      }}
    />
  );
}
