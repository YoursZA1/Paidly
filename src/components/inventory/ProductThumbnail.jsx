import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import AssetService from "@/services/AssetService";
import { cn } from "@/lib/utils";

/**
 * Ordered, de-duplicated image sources: the cached URL, a freshly built public URL, then the absolute URL
 * the server resolved (`fallbackSrc`, e.g. the POS catalog's `image_src`). A failed load moves to the next
 * one instead of giving up, so a stale browser cache can't blank a product photo.
 */
function imageCandidates(imageUrl, fallbackSrc) {
  const out = [];
  const add = (u) => {
    if (u && u !== AssetService.FALLBACK_LOGO && !out.includes(u)) out.push(u);
  };
  if (imageUrl) {
    add(AssetService.getLogo(imageUrl));
    add(AssetService.getFreshPublicUrl(imageUrl));
  }
  add(fallbackSrc);
  return out;
}

export default function ProductThumbnail({ imageUrl, fallbackSrc, name: _name, className, fit = "cover" }) {
  const candidates = useMemo(() => imageCandidates(imageUrl, fallbackSrc), [imageUrl, fallbackSrc]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [candidates]);

  const src = candidates[attempt] || null;
  const contain = fit === "contain";

  const onError = () => {
    if (attempt === 0 && imageUrl) AssetService.forgetLogo(imageUrl);
    if (attempt + 1 >= candidates.length) {
      console.warn("[ProductThumbnail] image could not be loaded", { imageUrl, tried: candidates });
    }
    setAttempt((n) => n + 1);
  };

  return (
    <div
      className={cn(
        "h-10 w-10 shrink-0 rounded-full border border-border/60 bg-muted/40 overflow-hidden flex items-center justify-center",
        className
      )}
      aria-hidden
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          className={cn("h-full w-full", contain ? "object-contain" : "object-cover")}
          onError={onError}
        />
      ) : (
        <Package className={cn("text-muted-foreground", contain ? "h-5 w-5" : "h-4 w-4")} />
      )}
    </div>
  );
}
