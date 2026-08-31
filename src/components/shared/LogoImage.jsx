import { useEffect, useRef, useState, memo } from "react";
import AssetService from "@/services/AssetService";
import { clearLogoUrlDiskCacheForSrc } from "@/lib/logoUrlDiskCache";
import { markStorageAssetFailed, verifyPublicStorageUrlOnce } from "@/lib/paidlyStorageAssetGuard";

const DEFAULT_LOGO_SRC = AssetService.FALLBACK_LOGO;

function normalizeUrlKey(url) {
  return String(url || "").split("?")[0].split("#")[0];
}

/**
 * LogoImage — resolves paths via {@link AssetService.getLogo} (includes path validation + failed-URL cache).
 *
 * @param {string} src - Stored path or full URL
 * @param {boolean} [preflightStorage] — If true, runs a one-shot HEAD before assigning `src` (extra latency; stricter).
 */
function LogoImage({
  src,
  alt = "Logo",
  className = "",
  style = {},
  preflightStorage = false,
  loading = "lazy",
}) {
  /** `null` = not resolved yet; `""` = missing `src` prop */
  const [imageSrc, setImageSrc] = useState(/** @type {string | null} */ (null));
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  /** After the fallback asset also errors, ignore further `error` events (browser may repeat). */
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

    const applyResolved = () => {
      const resolvedUrl = AssetService.getLogo(src);
      if (cancelled) return;
      if (!resolvedUrl || resolvedUrl === DEFAULT_LOGO_SRC) {
        setImageSrc(DEFAULT_LOGO_SRC);
        setIsLoading(false);
        return;
      }
      setImageSrc(resolvedUrl);
      setIsLoading(false);
    };

    if (!preflightStorage) {
      applyResolved();
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const resolvedUrl = AssetService.getLogo(src);
      if (cancelled) return;
      if (!resolvedUrl || resolvedUrl === DEFAULT_LOGO_SRC) {
        setImageSrc(DEFAULT_LOGO_SRC);
        setIsLoading(false);
        return;
      }
      if (/^https?:\/\//i.test(resolvedUrl)) {
        const ok = await verifyPublicStorageUrlOnce(resolvedUrl);
        if (cancelled) return;
        if (!ok) {
          markStorageAssetFailed(resolvedUrl);
          clearLogoUrlDiskCacheForSrc(src);
        }
      }
      if (cancelled) return;
      setImageSrc(AssetService.getLogo(src));
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [src, preflightStorage]);

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
