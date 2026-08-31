import { useState } from "react";
import { Package } from "lucide-react";
import AssetService from "@/services/AssetService";
import { cn } from "@/lib/utils";

export default function ProductThumbnail({ imageUrl, name: _name, className, fit = "cover" }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl && !failed ? AssetService.getLogo(imageUrl) : null;
  const contain = fit === "contain";

  return (
    <div
      className={cn(
        "h-10 w-10 shrink-0 rounded-full border border-border/60 bg-muted/40 overflow-hidden flex items-center justify-center",
        className
      )}
      aria-hidden
    >
      {src && src !== AssetService.FALLBACK_LOGO ? (
        <img
          src={src}
          alt=""
          className={cn("h-full w-full", contain ? "object-contain" : "object-cover")}
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className={cn("text-muted-foreground", contain ? "h-5 w-5" : "h-4 w-4")} />
      )}
    </div>
  );
}
