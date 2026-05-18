import { useState } from "react";
import { Package } from "lucide-react";
import AssetService from "@/services/AssetService";
import { cn } from "@/lib/utils";

export default function ProductThumbnail({ imageUrl, name, className }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl && !failed ? AssetService.getLogo(imageUrl) : null;

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
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
