import { useEffect, useRef, useState, memo } from "react";
import AssetService from "@/services/AssetService";
import { clearLogoUrlDiskCacheForSrc } from "@/lib/logoUrlDiskCache";
import { markStorageAssetFailed } from "@/lib/paidlyStorageAssetGuard";

const DEFAULT_LOGO_SRC = AssetService.FALLBACK_LOGO;
const SECONDARY_FALLBACK_SRC = "/icon.svg";

function resolveDisplaySrc(path) {
  if (!path) return DEFAULT_LOGO_SRC;
  const url = AssetService.getLogo(path);
  return url || DEFAULT_LOGO_SRC;
}

/**
 * Company / profile logo from a stored path or URL.
 * Uses React state for the displayed `src` so a broken storage URL is not re-applied on every parent
 * re-render (DOM-only `onError` fixes would fight React and re-trigger network requests).
 */
function Logo({ path, className = "", alt = "Logo" }) {
  const [displaySrc, setDisplaySrc] = useState(() => resolveDisplaySrc(path));
  /** 0 = primary resolved URL, 1 = default PNG, 2 = secondary SVG — never loop past 2. */
  const stageRef = useRef(0);

  useEffect(() => {
    stageRef.current = 0;
    setDisplaySrc(resolveDisplaySrc(path));
  }, [path]);

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        setDisplaySrc((prev) => {
          if (stageRef.current === 0) {
            if (
              prev &&
              prev !== DEFAULT_LOGO_SRC &&
              !prev.startsWith("blob:") &&
              !prev.startsWith("data:")
            ) {
              markStorageAssetFailed(prev);
              clearLogoUrlDiskCacheForSrc(path);
            }
            stageRef.current = 1;
            return DEFAULT_LOGO_SRC;
          }
          if (stageRef.current === 1) {
            stageRef.current = 2;
            return SECONDARY_FALLBACK_SRC;
          }
          return prev;
        });
      }}
    />
  );
}

export default memo(Logo);
