import { useEffect, useRef, useState, memo } from "react";
import AssetService from "@/services/AssetService";
import { clearLogoUrlDiskCacheForSrc } from "@/lib/logoUrlDiskCache";
import { markStorageAssetFailed } from "@/lib/paidlyStorageAssetGuard";

const DEFAULT_LOGO_SRC = AssetService.FALLBACK_LOGO;

function normalizeUrlKey(url) {
  return String(url || "").split("?")[0].split("#")[0];
}

/**
 * LogoImage — prefers a signed storage URL so Settings works when the
 * `paidly` bucket is private (public /object/public/paidly/* returns 400).
 *
 * @param {string} src - Stored path or full URL
 * @param {boolean} [preflightStorage] — unused; kept so existing callers compile
 */
function LogoImage({
  src,
  alt = "Logo",
  className = "",
  style = {},
  preflightStorage = false,
  loading = "lazy",
}) {
  void preflightStorage;
  const [imageSrc, setImageSrc] = useState(/** @type {string | null} */ (null));
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const terminalRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setHasError(true);
      setIsLoading(false);
      setImageSrc("");
      return undefined;
    }

    setHasError(false);
    setIsLoading(true);
    setImageSrc(null);
    terminalRef.current = false;

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setImageSrc(src);
      setIsLoading(false);
      return undefined;
    }

    (async () => {
      const signed = await AssetService.signLogoUrl(src);
      if (cancelled) return;
      if (signed && signed !== DEFAULT_LOGO_SRC) {
        setImageSrc(signed);
        setIsLoading(false);
        return;
      }
      const resolvedUrl = AssetService.getLogo(src);
      if (cancelled) return;
      setImageSrc(resolvedUrl && resolvedUrl !== DEFAULT_LOGO_SRC ? resolvedUrl : DEFAULT_LOGO_SRC);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (hasError || imageSrc === "") {
    return (
      <img
        src={DEFAULT_LOGO_SRC}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        decoding="async"
      />
    );
  }

  if (isLoading || imageSrc === null) {
    return <div className={`bg-gray-100 animate-pulse ${className}`} style={style} />;
  }

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
      loading={loading}
      decoding="async"
      {...(needsCorsForCapture ? { crossOrigin: "anonymous" } : {})}
      onError={(e) => {
        if (terminalRef.current) return;
        const failed = normalizeUrlKey(e.currentTarget?.src);
        if (failed && failed !== normalizeUrlKey(DEFAULT_LOGO_SRC)) {
          markStorageAssetFailed(failed);
          clearLogoUrlDiskCacheForSrc(src);
          terminalRef.current = true;
          setImageSrc(DEFAULT_LOGO_SRC);
          setHasError(false);
          setIsLoading(false);
          return;
        }
        terminalRef.current = true;
        setHasError(true);
        setIsLoading(false);
      }}
      onLoad={() => {
        setIsLoading(false);
      }}
    />
  );
}

export default memo(LogoImage);
