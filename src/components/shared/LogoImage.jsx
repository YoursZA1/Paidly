import { useState, useEffect } from "react";
import AssetService from "@/services/AssetService";

const DEFAULT_LOGO_SRC = "/fallback-logo.png";

/**
 * LogoImage component that resolves paths through AssetService.getLogo().
 * @param {string} src - The logo URL or stored logo path
 * @param {string} alt - Alt text for the image
 * @param {string} className - CSS classes
 * @param {object} style - Inline styles
 */
export default function LogoImage({ 
  src, 
  alt = "Logo", 
  className = "", 
  style = {}
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

    const resolvedUrl = AssetService.getLogo(src);
    if (resolvedUrl) {
      setImageSrc(resolvedUrl);
      setIsLoading(false);
      return;
    }
    setHasError(true);
    setIsLoading(false);
  }, [src]);

  if (hasError || !imageSrc) {
    return null; // Or return a placeholder icon
  }

  if (isLoading) {
    return (
      <div className={`bg-gray-100 animate-pulse ${className}`} style={style} />
    );
  }

  // html2canvas needs CORS-safe images; limit to Supabase storage hosts.
  const needsCorsForCapture =
    typeof imageSrc === "string" &&
    imageSrc.includes("supabase.co") &&
    (imageSrc.startsWith("https://") || imageSrc.startsWith("http://"));

  return (
    <img
      src={imageSrc || DEFAULT_LOGO_SRC}
      alt={alt}
      className={className}
      style={style}
      {...(needsCorsForCapture ? { crossOrigin: "anonymous" } : {})}
      onError={() => {
        if (imageSrc !== DEFAULT_LOGO_SRC) {
          setImageSrc(DEFAULT_LOGO_SRC);
          setHasError(false);
          setIsLoading(false);
          return;
        }
        setHasError(true);
        setIsLoading(false);
      }}
      onLoad={() => {
        setIsLoading(false);
      }}
    />
  );
}
