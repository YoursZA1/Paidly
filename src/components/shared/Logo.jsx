import AssetService from "@/services/AssetService";

const DEFAULT_LOGO_SRC = AssetService.FALLBACK_LOGO;
const SECONDARY_FALLBACK_SRC = "/icon.svg";

export default function Logo({ path, className = "", alt = "Logo" }) {
  const url = AssetService.getLogo(path);
  const resolvedSrc = url || DEFAULT_LOGO_SRC;

  return (
    <img
      key={resolvedSrc}
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={(e) => {
        const stage = e.currentTarget.dataset.fallbackStage || "0";
        if (stage === "0") {
          e.currentTarget.dataset.fallbackStage = "1";
          e.currentTarget.src = DEFAULT_LOGO_SRC;
          return;
        }
        if (stage === "1") {
          e.currentTarget.dataset.fallbackStage = "2";
          e.currentTarget.src = SECONDARY_FALLBACK_SRC;
        }
      }}
    />
  );
}
